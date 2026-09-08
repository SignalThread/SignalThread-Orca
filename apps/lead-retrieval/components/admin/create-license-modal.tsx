"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminLicenseBilling,
  AdminLicenseBillingSource,
  AdminLicenseEventOption,
  AdminLicenseExhibitorOption,
  AdminLicenseHostCompanyOption,
  AdminLicensePlanOption,
  AdminLicenseScope,
  AdminLicenseStatus
} from "@/lib/data/admin-licenses-types";

type CreateLicenseModalProps = {
  open: boolean;
  defaultEventId?: string;
  events: AdminLicenseEventOption[];
  exhibitors: AdminLicenseExhibitorOption[];
  companyOptions?: AdminLicenseHostCompanyOption[];
  /** Event host companies — used to set `licenses.company_id` for company-scoped licenses. */
  hostCompanies?: AdminLicenseHostCompanyOption[];
  licensePlans: AdminLicensePlanOption[];
  initialScope?: AdminLicenseScope;
  scopeLocked?: boolean;
  companyScopedSimple?: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function isoDateFromNow() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateIso: string, months: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function CreateLicenseModal({
  open,
  defaultEventId,
  events,
  exhibitors,
  companyOptions = [],
  hostCompanies = [],
  licensePlans,
  initialScope = "event",
  scopeLocked = false,
  companyScopedSimple = false,
  onClose,
  onCreated
}: CreateLicenseModalProps) {
  const [scope, setScope] = useState<AdminLicenseScope>(initialScope);
  const [billing, setBilling] = useState<AdminLicenseBilling>("one_time");
  const [billingSource, setBillingSource] = useState<AdminLicenseBillingSource>("internal");
  const [eventId, setEventId] = useState(defaultEventId ?? events[0]?.id ?? "");
  const [exhibitorCompanyId, setExhibitorCompanyId] = useState("");
  const [planId, setPlanId] = useState("");
  const [seatsTotal, setSeatsTotal] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [startsAt, setStartsAt] = useState(isoDateFromNow());
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<AdminLicenseStatus>("active");
  const [hostCompanyId, setHostCompanyId] = useState("");
  const [allowExhibitorEventCreation, setAllowExhibitorEventCreation] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const initialEventId = defaultEventId ?? events[0]?.id ?? "";
    const initialStart = isoDateFromNow();
    const defaultPlan = licensePlans[0] ?? null;
    const defaultTerm = defaultPlan ? String(defaultPlan.defaultTermMonths || 12) : "12";

    setScope(initialScope);
    setBilling("one_time");
    setBillingSource("internal");
    setEventId(initialEventId);
    setExhibitorCompanyId("");
    setPlanId(defaultPlan?.id ?? "");
    setSeatsTotal("");
    setTermMonths(defaultTerm);
    setPriceDollars("");
    setStartsAt(initialStart);
    setExpiresAt(addMonths(initialStart, Number(defaultTerm) || 12));
    setStatus("active");
    setHostCompanyId(hostCompanies[0]?.id ?? "");
    setAllowExhibitorEventCreation(true);
    setSubmitting(false);
    setErrorMessage(null);
  }, [defaultEventId, events, hostCompanies, initialScope, licensePlans, open]);

  useEffect(() => {
    if (!termMonths || !startsAt) return;
    const months = Number(termMonths);
    if (!Number.isInteger(months) || months <= 0) return;
    setExpiresAt(addMonths(startsAt, months));
  }, [termMonths, startsAt]);

  const exhibitorChoices = useMemo(() => {
    if (scope === "event") {
      return exhibitors.filter((item) => item.eventId && item.eventId === eventId);
    }
    if (companyOptions.length > 0) {
      return companyOptions.map((item) => ({
        id: `co-${item.id}`,
        eventId: "",
        companyId: item.id,
        name: item.name
      }));
    }
    const byCompany = new Map<string, AdminLicenseExhibitorOption>();
    for (const item of exhibitors) {
      if (!byCompany.has(item.companyId)) {
        byCompany.set(item.companyId, item);
      }
    }
    return Array.from(byCompany.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [scope, eventId, exhibitors]);

  useEffect(() => {
    if (scope !== "event" || !exhibitorCompanyId) return;
    const ok = exhibitors.some((e) => e.eventId === eventId && e.companyId === exhibitorCompanyId);
    if (!ok) {
      setExhibitorCompanyId("");
    }
  }, [scope, eventId, exhibitors, exhibitorCompanyId]);

  const selectedPlan = useMemo(
    () => licensePlans.find((plan) => plan.id === planId) ?? null,
    [licensePlans, planId]
  );
  const isSimpleCompanyScoped = scope === "company" && companyScopedSimple;

  async function handleSubmit() {
    if (submitting) return;

    const parsedSeats = Number(seatsTotal);
    const parsedTerm = Number(termMonths);
    const parsedPrice = Number(priceDollars);
    const effectivePlanId = isSimpleCompanyScoped ? (planId || licensePlans[0]?.id || null) : planId;
    const effectiveTermMonths = isSimpleCompanyScoped
      ? Number.isInteger(parsedTerm) && parsedTerm > 0
        ? parsedTerm
        : selectedPlan?.defaultTermMonths || licensePlans[0]?.defaultTermMonths || 12
      : parsedTerm;
    const effectivePriceCents = isSimpleCompanyScoped ? 0 : Math.round(parsedPrice * 100);

    if (scope === "event" && !eventId) {
      setErrorMessage("Event is required.");
      return;
    }
    if (!exhibitorCompanyId) {
      setErrorMessage("Exhibitor company is required.");
      return;
    }
    if (scope === "company" && !hostCompanyId) {
      setErrorMessage("A default billing organization is not configured for company-scoped licenses.");
      return;
    }
    if (!isSimpleCompanyScoped && !planId) {
      setErrorMessage("License plan is required.");
      return;
    }
    if (!Number.isInteger(parsedSeats) || parsedSeats <= 0) {
      setErrorMessage("Seats must be a whole number greater than 0.");
      return;
    }
    if (!Number.isInteger(effectiveTermMonths) || effectiveTermMonths <= 0) {
      setErrorMessage("Term (months) must be a whole number greater than 0.");
      return;
    }
    if (!isSimpleCompanyScoped && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setErrorMessage("Price must be a positive number.");
      return;
    }
    if (!expiresAt) {
      setErrorMessage("Expiration date is required.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          billing,
          billingSource,
          ...(scope === "event" ? { eventId } : { hostCompanyId, canCreateEvents: allowExhibitorEventCreation }),
          exhibitorCompanyId,
          licensePlanId: effectivePlanId,
          termMonths: effectiveTermMonths,
          seatsTotal: parsedSeats,
          priceCents: effectivePriceCents,
          currency: "USD",
          startsAt,
          expiresAt,
          status
        })
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to create license.");
        return;
      }

      onCreated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create license.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="border-b border-border px-6 py-6 sm:px-8">
          <h2 className="text-4xl font-bold">Create License</h2>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
          {scopeLocked && !isSimpleCompanyScoped ? (
            <div className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">License scope</span>
              <div className="flex h-14 items-center rounded-2xl border border-border bg-slate-50 px-4 text-base font-semibold text-slate-700">
                {scope === "company" ? "Company (buyer account; event optional)" : "Event (participation / per-show seats)"}
              </div>
              <span className="text-xs text-slate-500">
                Company scope bills against the host you select and can grant the buyer permission to create their own
                events.
              </span>
            </div>
          ) : !scopeLocked ? (
            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">License scope *</span>
              <select
                value={scope}
                onChange={(event) => {
                  const next = event.target.value as AdminLicenseScope;
                  setScope(next);
                  setExhibitorCompanyId("");
                  setErrorMessage(null);
                  if (next === "company") {
                    setHostCompanyId(hostCompanies[0]?.id ?? "");
                  }
                }}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="event">Event (participation / per-show seats)</option>
                <option value="company">Company (buyer account; event optional)</option>
              </select>
              <span className="text-xs text-slate-500">
                Company scope bills against the host you select and can grant the buyer permission to create their own
                events.
              </span>
            </label>
          ) : null}

          {scope === "event" ? (
            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Event *</span>
              <select
                value={eventId}
                onChange={(event) => {
                  setEventId(event.target.value);
                  setExhibitorCompanyId("");
                }}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {scope === "company" && !isSimpleCompanyScoped ? (
            <>
              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Billing organization *</span>
                <select
                  value={hostCompanyId}
                  onChange={(event) => {
                    setHostCompanyId(event.target.value);
                    setErrorMessage(null);
                  }}
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="">Select host company…</option>
                  {hostCompanies.map((host) => (
                    <option key={host.id} value={host.id}>
                      {host.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-border"
                  checked={allowExhibitorEventCreation}
                  onChange={(event) => setAllowExhibitorEventCreation(event.target.checked)}
                />
                <span className="text-sm text-slate-700">
                  <span className="font-semibold text-slate-800">Allow exhibitor admins to create events</span>
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Turn off only if you intentionally want a company-scoped seat pack without event creation.
                  </span>
                </span>
              </label>
            </>
          ) : null}

          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">
              {isSimpleCompanyScoped ? "Company *" : "Exhibitor company *"}
            </span>
            <select
              value={exhibitorCompanyId}
              onChange={(event) => {
                setExhibitorCompanyId(event.target.value);
                setErrorMessage(null);
              }}
              className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">{isSimpleCompanyScoped ? "Select company…" : "Select exhibitor company…"}</option>
              {exhibitorChoices.map((exhibitor) => (
                <option key={`${exhibitor.eventId}:${exhibitor.companyId}`} value={exhibitor.companyId}>
                  {exhibitor.name}
                </option>
              ))}
            </select>
          </label>

          {!isSimpleCompanyScoped ? (
            <>
              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Billing *</span>
                <select
                  value={billing}
                  onChange={(event) => setBilling(event.target.value as AdminLicenseBilling)}
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="one_time">One-time</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>

              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Billing Source *</span>
                <select
                  value={billingSource}
                  onChange={(event) => setBillingSource(event.target.value as AdminLicenseBillingSource)}
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="internal">Internal</option>
                  <option value="stripe">Stripe</option>
                  <option value="app_store">App Store</option>
                  <option value="google_play">Google Play</option>
                </select>
              </label>

              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">License Plan *</span>
                <select
                  value={planId}
                  onChange={(event) => {
                    const nextPlanId = event.target.value;
                    setPlanId(nextPlanId);
                    const matched = licensePlans.find((plan) => plan.id === nextPlanId);
                    if (matched?.defaultTermMonths) {
                      setTermMonths(String(matched.defaultTermMonths));
                    }
                  }}
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="">Select plan...</option>
                  {licensePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                {selectedPlan ? (
                  <span className="text-xs text-slate-500">Default term: {selectedPlan.defaultTermMonths} months</span>
                ) : null}
              </label>
            </>
          ) : null}

          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">Seats *</span>
            <input
              value={seatsTotal}
              onChange={(event) => setSeatsTotal(event.target.value)}
              inputMode="numeric"
              placeholder="e.g., 50"
              className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </label>

          {!isSimpleCompanyScoped ? (
            <>
              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Term (months) *</span>
                <input
                  value={termMonths}
                  onChange={(event) => setTermMonths(event.target.value)}
                  inputMode="numeric"
                  placeholder="e.g., 12"
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Price (USD) *</span>
                <input
                  value={priceDollars}
                  onChange={(event) => setPriceDollars(event.target.value)}
                  inputMode="decimal"
                  placeholder="e.g., 24950"
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <label className="block space-y-2.5">
                  <span className="text-sm font-semibold text-slate-700">Starts At</span>
                  <input
                    type="date"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>

                <label className="block space-y-2.5">
                  <span className="text-sm font-semibold text-slate-700">Expires At *</span>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="block space-y-2.5">
              <span className="text-sm font-semibold text-slate-700">Expires / Renews date</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <span className="text-xs text-slate-500">
                Optional to change. We’ll use the existing default date if you leave this as-is.
              </span>
            </label>
          )}

          <label className="block space-y-2.5">
            <span className="text-sm font-semibold text-slate-700">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as AdminLicenseStatus)}
              className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
            </select>
          </label>

          {errorMessage ? <p className="text-sm font-medium text-rose-600">{errorMessage}</p> : null}
        </div>

        <div className="border-t border-border px-6 py-5 sm:px-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <button type="button" onClick={onClose} className="h-14 rounded-2xl bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? "Creating..." : "Create License"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
