"use client";

import { useEffect, useState } from "react";

export type AddExhibitorModalEventOption = { id: string; name: string };
export type AddExhibitorModalHostOption = { id: string; name: string };

type AddExhibitorModalProps = {
  open: boolean;
  events: AddExhibitorModalEventOption[];
  hostCompanies: AddExhibitorModalHostOption[];
  /** Current page event filter — used as the default in the modal. */
  pageEventId: string;
  onClose: () => void;
  onCreated: () => void;
};

type LicenseStatus = "active" | "trial" | "expired";

export function AddExhibitorModal({
  open,
  events,
  hostCompanies,
  pageEventId,
  onClose,
  onCreated
}: AddExhibitorModalProps) {
  const [modalEventId, setModalEventId] = useState("");
  const [hostCompanyId, setHostCompanyId] = useState("");
  const [exhibitorName, setExhibitorName] = useState("");
  const [seatsPurchased, setSeatsPurchased] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>("active");
  const [revenue, setRevenue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const suggested =
      pageEventId && events.some((event) => event.id === pageEventId) ? pageEventId : "";
    setModalEventId(suggested);
    setHostCompanyId(hostCompanies[0]?.id ?? "");
    setExhibitorName("");
    setSeatsPurchased("");
    setLicenseStatus("active");
    setRevenue("");
    setSubmitting(false);
    setErrorMessage(null);
  }, [open, pageEventId, events, hostCompanies]);

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    const normalizedName = exhibitorName.trim();
    const parsedSeats = Number(seatsPurchased);
    const parsedRevenue = revenue.trim() ? Number(revenue) : null;

    if (!normalizedName) {
      setErrorMessage("Company name is required.");
      return;
    }
    if (!Number.isFinite(parsedSeats) || parsedSeats <= 0 || !Number.isInteger(parsedSeats)) {
      setErrorMessage("Seats purchased must be a whole number greater than 0.");
      return;
    }
    if (parsedRevenue !== null && (!Number.isFinite(parsedRevenue) || parsedRevenue < 0)) {
      setErrorMessage("Revenue must be a positive number.");
      return;
    }
    if (!modalEventId && !hostCompanyId) {
      setErrorMessage("Choose a billing organization, or select an event to use that event’s host.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const body: Record<string, unknown> = {
        exhibitorName: normalizedName,
        seatsPurchased: parsedSeats,
        licenseStatus,
        revenue: parsedRevenue
      };
      if (modalEventId) {
        body.eventId = modalEventId;
      } else {
        body.hostCompanyId = hostCompanyId;
      }

      const response = await fetch("/api/v1/exhibitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setErrorMessage(payload.message ?? "Failed to create exhibitor company.");
        return;
      }

      onCreated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create exhibitor company.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const canSubmit = !submitting && (Boolean(modalEventId) || Boolean(hostCompanyId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-xl">
        <div className="border-b border-border px-6 py-6 sm:px-8">
          <h2 className="text-3xl font-bold">Add exhibitor company</h2>
          <p className="mt-2 text-sm text-slate-600">
            Creates the buyer&apos;s <span className="font-semibold text-slate-800">company account</span> and a starter
            license. Optionally link them to an event now — you can also attach them to events later.
          </p>
        </div>

        <div className="space-y-4 px-6 py-6 sm:px-8">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Event (optional)</span>
            <select
              value={modalEventId}
              onChange={(event) => setModalEventId(event.target.value)}
              className="h-10 w-full rounded-xl border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">No event — company + company license only</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              If you pick an event, we also create the exhibitor participation row for that event and an event-scoped
              license seat pack.
            </span>
          </label>

          {!modalEventId ? (
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Billing organization *</span>
              <select
                value={hostCompanyId}
                onChange={(event) => setHostCompanyId(event.target.value)}
                className="h-10 w-full rounded-xl border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Select host company…</option>
                {hostCompanies.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">
                Which organizer account bills this buyer when no event is selected (sets the company&apos;s organizer).
              </span>
            </label>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Company name *</span>
            <input
              value={exhibitorName}
              onChange={(event) => setExhibitorName(event.target.value)}
              placeholder="e.g., CloudTech Solutions"
              className="h-10 w-full rounded-xl border border-border px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Seats purchased *</span>
            <input
              value={seatsPurchased}
              onChange={(event) => setSeatsPurchased(event.target.value)}
              inputMode="numeric"
              placeholder="e.g., 50"
              className="h-10 w-full rounded-xl border border-border px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">License status</span>
            <select
              value={licenseStatus}
              onChange={(event) => setLicenseStatus(event.target.value as LicenseStatus)}
              className="h-10 w-full rounded-xl border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">Revenue (optional)</span>
            <input
              value={revenue}
              onChange={(event) => setRevenue(event.target.value)}
              inputMode="decimal"
              placeholder="e.g., 22500"
              className="h-10 w-full rounded-xl border border-border px-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          {!events.length && !modalEventId ? (
            <p className="text-xs font-medium text-amber-700">
              There are no events in scope yet. Choose a billing organization above, or create an event first to link
              participation.
            </p>
          ) : null}
          {!modalEventId && !hostCompanies.length ? (
            <p className="text-xs font-medium text-amber-700">No host companies are available for billing.</p>
          ) : null}
          {errorMessage ? <p className="text-xs font-medium text-rose-600">{errorMessage}</p> : null}
        </div>

        <div className="border-t border-border px-6 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl bg-slate-100 text-base font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="h-11 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-base font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
            >
              {submitting ? "Creating…" : "Create company"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
