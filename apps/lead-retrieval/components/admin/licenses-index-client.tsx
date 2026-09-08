"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateLicenseModal } from "@/components/admin/create-license-modal";
import { AdminPageHeader, LicenseStatusBadge } from "@/components/admin/admin-ui";
import {
  formatCurrency,
  formatPriceCents,
  getSeatUsagePercent
} from "@/lib/client/admin-formatters";
import type {
  AdminLicenseBilling,
  AdminLicenseBillingSource,
  AdminLicenseEventOption,
  AdminLicenseExhibitorOption,
  AdminLicenseHostCompanyOption,
  AdminLicensePlanOption,
  AdminLicenseRow,
  AdminLicenseStatus
} from "@/lib/data/admin-licenses-types";
import {
  OrganizerFilterBar,
  OrganizerFilterField,
  OrganizerFilterSelect,
  OrganizerSearchField
} from "@/components/organizer/organizer-filter-bar";

type LicenseTableScopeFilter = "all" | "company" | "event";

type LicensesIndexClientProps = {
  events: AdminLicenseEventOption[];
  exhibitors: AdminLicenseExhibitorOption[];
  hostCompanies?: AdminLicenseHostCompanyOption[];
  licensePlans: AdminLicensePlanOption[];
  licenses: AdminLicenseRow[];
  /** Default event for Create License modal (platform: typically first event; organizer: scoped event). */
  defaultEventIdForCreate?: string;
  title?: string;
  subtitle?: string;
  currencyMaximumFractionDigits?: number;
  /** Organizer: optional context chip (e.g. current event). */
  eventContextLabel?: string;
  /** Organizer Admin: shared filter row + exhibitor/plan/status filters. */
  organizerFilterLayout?: boolean;
};

type EditLicensePayload = {
  action: "edit";
  licensePlanId?: string | null;
  status?: AdminLicenseStatus;
  expiration?: string;
  priceCents?: number;
  billing?: AdminLicenseBilling;
  billingSource?: AdminLicenseBillingSource;
};

type AddSeatsPayload = {
  action: "add_seats";
  seatsToAdd: number;
};

type DeactivatePayload = {
  action: "deactivate";
};

type LicenseMutationPayload = EditLicensePayload | AddSeatsPayload | DeactivatePayload;

type DeleteConfirmState = {
  license: AdminLicenseRow;
  dependentCount: number | null;
  stage: "confirm" | "blocked";
} | null;

export function LicensesIndexClient({
  events,
  exhibitors,
  hostCompanies = [],
  licensePlans,
  licenses,
  defaultEventIdForCreate,
  title = "Licenses",
  subtitle = "Manage seat allocations and revenue",
  currencyMaximumFractionDigits,
  eventContextLabel,
  organizerFilterLayout = false
}: LicensesIndexClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState(licenses);
  const [openModal, setOpenModal] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<LicenseTableScopeFilter>("all");
  const [search, setSearch] = useState("");
  const [exhibitorFilter, setExhibitorFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | AdminLicenseStatus>("all");
  const [busyLicenseId, setBusyLicenseId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingLicense, setEditingLicense] = useState<AdminLicenseRow | null>(null);
  const [editPlanId, setEditPlanId] = useState("");
  const [editStatus, setEditStatus] = useState<AdminLicenseStatus>("active");
  const [editExpiration, setEditExpiration] = useState("");
  const [editPriceDollars, setEditPriceDollars] = useState("");
  const [editBilling, setEditBilling] = useState<AdminLicenseBilling>("one_time");
  const [editBillingSource, setEditBillingSource] = useState<AdminLicenseBillingSource>("internal");

  const [seatsLicense, setSeatsLicense] = useState<AdminLicenseRow | null>(null);
  const [seatsToAdd, setSeatsToAdd] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);

  useEffect(() => {
    setRows(licenses);
  }, [licenses]);

  useEffect(() => {
    if (!organizerFilterLayout) return;
    setExhibitorFilter("all");
    setPlanFilter("all");
    setStatusFilter("all");
  }, [scopeFilter, organizerFilterLayout]);

  const exhibitorsForFilters = useMemo(() => {
    const seen = new Set<string>();
    return exhibitors.filter((row) => {
      if (seen.has(row.companyId)) return false;
      seen.add(row.companyId);
      return true;
    });
  }, [exhibitors]);

  const createModalDefaultEventId = useMemo(
    () => defaultEventIdForCreate ?? events[0]?.id ?? "",
    [defaultEventIdForCreate, events]
  );

  const scopedLicenses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((license) => {
      if (scopeFilter === "company" && license.scope !== "company") return false;
      if (scopeFilter === "event" && license.scope !== "event") return false;
      if (organizerFilterLayout) {
        if (exhibitorFilter !== "all" && license.exhibitorCompanyId !== exhibitorFilter) return false;
        if (planFilter !== "all" && (license.licensePlanId ?? "") !== planFilter) return false;
        if (statusFilter !== "all" && license.status !== statusFilter) return false;
      }
      if (!normalizedSearch) return true;
      return license.exhibitorName.toLowerCase().includes(normalizedSearch);
    });
  }, [
    rows,
    scopeFilter,
    search,
    organizerFilterLayout,
    exhibitorFilter,
    planFilter,
    statusFilter
  ]);

  const kpis = useMemo(() => {
    const seatTotal = scopedLicenses.reduce((sum, row) => sum + row.seatsTotal, 0);
    const seatUsed = scopedLicenses.reduce((sum, row) => sum + row.seatsUsed, 0);
    const revenue = scopedLicenses.reduce((sum, row) => sum + row.priceCents / 100, 0);
    return {
      totalSeats: seatTotal,
      seatsUsed: seatUsed,
      totalRevenue: revenue,
      utilizationRate: seatTotal ? Math.round((seatUsed / seatTotal) * 100) : 0
    };
  }, [scopedLicenses]);

  const patchLicense = async (licenseId: string, body: LicenseMutationPayload) => {
    const response = await fetch(`/api/admin/licenses/${licenseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to update license");
    }

    router.refresh();
  };

  const openEditModal = (license: AdminLicenseRow) => {
    setErrorMessage(null);
    setEditingLicense(license);
    setEditPlanId(license.licensePlanId ?? "");
    setEditStatus(license.status);
    setEditExpiration(license.expiresAt ? license.expiresAt.slice(0, 10) : "");
    setEditPriceDollars((license.priceCents / 100).toFixed(2));
    setEditBilling(license.billing);
    setEditBillingSource(license.billingSource);
  };

  const handleEditSave = async () => {
    if (!editingLicense) return;

    const normalizedPrice = Number(editPriceDollars);
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      setErrorMessage("Price must be a positive number.");
      return;
    }

    setBusyLicenseId(editingLicense.id);
    setErrorMessage(null);

    try {
      await patchLicense(editingLicense.id, {
        action: "edit",
        licensePlanId: editPlanId || null,
        status: editStatus,
        expiration: editExpiration,
        priceCents: Math.round(normalizedPrice * 100),
        billing: editBilling,
        billingSource: editBillingSource
      });
      setEditingLicense(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update license");
    } finally {
      setBusyLicenseId(null);
    }
  };

  const openAddSeatsModal = (license: AdminLicenseRow) => {
    setErrorMessage(null);
    setSeatsLicense(license);
    setSeatsToAdd("");
  };

  const handleAddSeats = async () => {
    if (!seatsLicense) return;

    const nextSeats = Number(seatsToAdd);
    if (!Number.isInteger(nextSeats) || nextSeats <= 0) {
      setErrorMessage("Seats to add must be a whole number greater than 0.");
      return;
    }

    setBusyLicenseId(seatsLicense.id);
    setErrorMessage(null);

    try {
      await patchLicense(seatsLicense.id, {
        action: "add_seats",
        seatsToAdd: nextSeats
      });
      setSeatsLicense(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add seats");
    } finally {
      setBusyLicenseId(null);
    }
  };

  const handleDeactivate = async (license: AdminLicenseRow) => {
    const confirmed = window.confirm(`Deactivate ${license.exhibitorName} license?`);
    if (!confirmed) return;

    setBusyLicenseId(license.id);
    setErrorMessage(null);

    try {
      await patchLicense(license.id, { action: "deactivate" });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to deactivate license");
    } finally {
      setBusyLicenseId(null);
    }
  };

  const handleDeleteClick = (license: AdminLicenseRow) => {
    setErrorMessage(null);
    setDeleteConfirm({ license, dependentCount: null, stage: "confirm" });
  };

  const handleDeleteConfirm = async (force: boolean) => {
    if (!deleteConfirm) return;
    const { license } = deleteConfirm;

    setBusyLicenseId(license.id);
    setErrorMessage(null);

    try {
      const qs = force ? "?force=true" : "";
      const response = await fetch(`/api/admin/licenses/${license.id}${qs}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        dependentCount?: number;
      };

      if (response.status === 409 && payload.dependentCount) {
        setDeleteConfirm({
          license,
          dependentCount: payload.dependentCount,
          stage: "blocked"
        });
        return;
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete license");
      }

      setRows((prev) => prev.filter((row) => row.id !== license.id));
      setDeleteConfirm(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete license");
      setDeleteConfirm(null);
    } finally {
      setBusyLicenseId(null);
    }
  };

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title={title}
        subtitle={subtitle}
        action={
          <button
            type="button"
            onClick={() => setOpenModal(true)}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700"
          >
            + Create License
          </button>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Seats" value={String(kpis.totalSeats)} />
        <Metric label="Seats Used" value={String(kpis.seatsUsed)} />
        <Metric
          label="Total Revenue"
          value={formatCurrency(kpis.totalRevenue, "USD", {
            maximumFractionDigits: currencyMaximumFractionDigits
          })}
          tone="positive"
        />
        <Metric label="Utilization Rate" value={`${kpis.utilizationRate}%`} />
      </section>

      {organizerFilterLayout ? (
        <OrganizerFilterBar
          filters={
            <>
              <OrganizerFilterField label="Scope">
                <OrganizerFilterSelect
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value as LicenseTableScopeFilter)}
                  aria-label="Filter by license scope"
                >
                  <option value="all">All</option>
                  <option value="company">Company</option>
                  <option value="event">Event</option>
                </OrganizerFilterSelect>
              </OrganizerFilterField>
              <OrganizerFilterField label="Exhibitor">
                <OrganizerFilterSelect
                  value={exhibitorFilter}
                  onChange={(e) => setExhibitorFilter(e.target.value)}
                  aria-label="Filter by exhibitor"
                >
                  <option value="all">All exhibitors</option>
                  {exhibitorsForFilters.map((ex) => (
                    <option key={ex.companyId} value={ex.companyId}>
                      {ex.name}
                    </option>
                  ))}
                </OrganizerFilterSelect>
              </OrganizerFilterField>
              <OrganizerFilterField label="Plan">
                <OrganizerFilterSelect value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="Filter by plan">
                  <option value="all">All plans</option>
                  {licensePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </OrganizerFilterSelect>
              </OrganizerFilterField>
              <OrganizerFilterField label="Status">
                <OrganizerFilterSelect
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "all" | AdminLicenseStatus)}
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="expired">Expired</option>
                </OrganizerFilterSelect>
              </OrganizerFilterField>
            </>
          }
          search={
            <OrganizerFilterField label="Search" className="w-full">
              <OrganizerSearchField
                value={search}
                onChange={setSearch}
                placeholder="Search by exhibitor…"
                aria-label="Search licenses"
              />
            </OrganizerFilterField>
          }
        />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Scope</span>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as LicenseTableScopeFilter)}
              aria-label="Filter by license scope"
              className="h-11 min-w-[200px] rounded-xl border border-border bg-white px-4 text-base font-semibold"
            >
              <option value="all">All</option>
              <option value="company">Company</option>
              <option value="event">Event</option>
            </select>
            {eventContextLabel ? (
              <span className="rounded-lg bg-accentSoft px-3 py-1 text-sm font-semibold text-accent md:text-base">
                {eventContextLabel}
              </span>
            ) : null}
            <span className="rounded-lg bg-accentSoft px-3 py-1 text-sm font-semibold text-accent md:text-base">
              {scopedLicenses.length} licenses
            </span>
            <div className="relative ml-auto w-full min-w-[260px] flex-1 md:max-w-md">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by exhibitor..."
                className="h-12 w-full rounded-xl border border-border bg-white pl-12 pr-4 text-base placeholder:text-slate-400"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
        {errorMessage ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <div>
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[22%] px-4 py-3">Exhibitor</th>
                <th className="hidden w-[8%] px-4 py-3 md:table-cell">Scope</th>
                <th className="hidden w-[14%] px-4 py-3 2xl:table-cell">License Plan</th>
                <th className="w-[10%] px-4 py-3">Seats</th>
                <th className="w-[14%] px-4 py-3">Seats Used</th>
                <th className="w-[10%] px-4 py-3">Status</th>
                <th className="hidden w-[10%] px-4 py-3 2xl:table-cell">Expiration</th>
                <th className="hidden w-[8%] px-4 py-3 xl:table-cell">Revenue</th>
                <th className="w-[10%] px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scopedLicenses.map((license) => {
                const usagePercent = getSeatUsagePercent(license.seatsUsed, license.seatsTotal);
                return (
                  <tr key={license.id} className="border-b border-border/70 text-sm text-slate-700 transition hover:bg-slate-50/80 last:border-none">
                    <td className="px-4 py-4 text-base font-semibold text-slate-900">
                      <span className="block truncate">{license.exhibitorName}</span>
                      {license.scope === "company" ? (
                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                          Company License
                        </span>
                      ) : (
                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                          {license.eventName ?? "Event license"}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-4 text-sm font-medium capitalize text-slate-600 md:table-cell">
                      {license.scope === "company" ? "Company" : "Event"}
                    </td>
                    <td className="hidden px-4 py-4 2xl:table-cell">
                      <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">
                        {license.licensePlanName ?? license.licensePlanCode ?? "Unassigned"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-base font-semibold">{license.seatsTotal}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-rose-600">
                          {license.seatsUsed} / {license.seatsTotal}
                        </span>
                        <div className="h-2.5 w-20 rounded-full bg-slate-100">
                          <div className="h-2.5 rounded-full bg-accent" style={{ width: `${usagePercent}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <LicenseStatusBadge status={license.status} />
                    </td>
                    <td className="hidden px-4 py-4 font-medium 2xl:table-cell">
                      {license.expiresAt
                        ? new Date(license.expiresAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })
                        : "-"}
                    </td>
                    <td className="hidden px-4 py-4 text-base font-semibold text-emerald-600 xl:table-cell">
                      {formatPriceCents(license.priceCents, license.currency, {
                        maximumFractionDigits: currencyMaximumFractionDigits
                      })}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-3 text-lg">
                        <button
                          type="button"
                          onClick={() => openAddSeatsModal(license)}
                          className="text-accent hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Add seats"
                          disabled={busyLicenseId === license.id}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(license)}
                          className="text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Edit license"
                          disabled={busyLicenseId === license.id}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeactivate(license)}
                          className="text-rose-500 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Deactivate license"
                          disabled={busyLicenseId === license.id}
                        >
                          ⊘
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(license)}
                          className="text-red-600 hover:text-red-800 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Delete license"
                          disabled={busyLicenseId === license.id}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {scopedLicenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                    No licenses match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <CreateLicenseModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        defaultEventId={createModalDefaultEventId}
        events={events}
        exhibitors={exhibitors}
        hostCompanies={hostCompanies}
        licensePlans={licensePlans}
        onCreated={() => {
          setOpenModal(false);
          router.refresh();
        }}
      />

      {editingLicense ? (
        <ModalFrame
          title="Edit License"
          onClose={() => setEditingLicense(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setEditingLicense(null)}
                className="h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={busyLicenseId === editingLicense.id}
                className="h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:opacity-70"
              >
                {busyLicenseId === editingLicense.id ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <div className="space-y-1 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">Scope:</span>{" "}
              {editingLicense.scope === "company" ? "Company" : "Event"}
            </p>
            {editingLicense.scope === "event" ? (
              <p>
                <span className="font-semibold text-slate-800">Event:</span>{" "}
                {editingLicense.eventName ?? "—"}
              </p>
            ) : (
              <p className="text-slate-500">Company License — not tied to a single event.</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Billing</span>
              <select
                value={editBilling}
                onChange={(event) => setEditBilling(event.target.value as AdminLicenseBilling)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
              >
                <option value="one_time">One-time</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Billing Source</span>
              <select
                value={editBillingSource}
                onChange={(event) => setEditBillingSource(event.target.value as AdminLicenseBillingSource)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
              >
                <option value="internal">Internal</option>
                <option value="stripe">Stripe</option>
                <option value="app_store">App Store</option>
                <option value="google_play">Google Play</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Plan</span>
              <select
                value={editPlanId}
                onChange={(event) => setEditPlanId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
              >
                <option value="">Unassigned</option>
                {licensePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Status</span>
              <select
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value as AdminLicenseStatus)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Expiration</span>
              <input
                type="date"
                value={editExpiration}
                onChange={(event) => setEditExpiration(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Price (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editPriceDollars}
                onChange={(event) => setEditPriceDollars(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
              />
            </label>
          </div>
          {errorMessage ? <p className="mt-3 text-sm text-rose-600">{errorMessage}</p> : null}
        </ModalFrame>
      ) : null}

      {seatsLicense ? (
        <ModalFrame
          title="Add Seats"
          onClose={() => setSeatsLicense(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setSeatsLicense(null)}
                className="h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSeats}
                disabled={busyLicenseId === seatsLicense.id}
                className="h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:opacity-70"
              >
                {busyLicenseId === seatsLicense.id ? "Updating..." : "Add Seats"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Update seats for <span className="font-semibold text-slate-900">{seatsLicense.exhibitorName}</span>.
          </p>
          <label className="mt-4 block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Seats to add</span>
            <input
              type="number"
              min={1}
              value={seatsToAdd}
              onChange={(event) => setSeatsToAdd(event.target.value)}
              placeholder="e.g., 5"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium"
            />
          </label>
          {errorMessage ? <p className="mt-3 text-sm text-rose-600">{errorMessage}</p> : null}
        </ModalFrame>
      ) : null}

      {deleteConfirm ? (
        <ModalFrame
          title="Delete License"
          onClose={() => setDeleteConfirm(null)}
          footer={
            deleteConfirm.stage === "blocked" ? (
              <>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteConfirm(true)}
                  disabled={busyLicenseId === deleteConfirm.license.id}
                  className="h-12 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-70"
                >
                  {busyLicenseId === deleteConfirm.license.id
                    ? "Deleting..."
                    : `Revoke Access & Delete`}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="h-12 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteConfirm(false)}
                  disabled={busyLicenseId === deleteConfirm.license.id}
                  className="h-12 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-70"
                >
                  {busyLicenseId === deleteConfirm.license.id
                    ? "Deleting..."
                    : "Delete License"}
                </button>
              </>
            )
          }
        >
          {deleteConfirm.stage === "blocked" ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                This license has{" "}
                <span className="font-bold">{deleteConfirm.dependentCount}</span> active
                app user(s) with seats assigned under it.
              </p>
              <p className="text-sm text-slate-600">
                Force deleting will <span className="font-semibold text-red-600">revoke app access</span>{" "}
                for all dependent users and then permanently remove the license for{" "}
                <span className="font-semibold text-slate-900">
                  {deleteConfirm.license.exhibitorName}
                </span>.
              </p>
              <p className="text-sm font-medium text-red-600">This action cannot be undone.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Permanently delete the license for{" "}
                <span className="font-semibold text-slate-900">
                  {deleteConfirm.license.exhibitorName}
                </span>
                ?
              </p>
              <p className="text-sm text-slate-500">
                {deleteConfirm.license.seatsTotal} seat(s) allocated
                {deleteConfirm.license.seatsUsed > 0
                  ? `, ${deleteConfirm.license.seatsUsed} in use`
                  : ""}
                . This will remove the license row from the database.
              </p>
              <p className="text-sm font-medium text-red-600">This action cannot be undone.</p>
            </div>
          )}
        </ModalFrame>
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
  value: string;
  tone?: "default" | "positive";
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
      <p className={`text-3xl font-bold md:text-4xl ${tone === "positive" ? "text-emerald-600" : "text-slate-950"}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{label}</p>
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

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function ModalFrame({
  title,
  onClose,
  footer,
  children
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-2xl font-bold text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}
