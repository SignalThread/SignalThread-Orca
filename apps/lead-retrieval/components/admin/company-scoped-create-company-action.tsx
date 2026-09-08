"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminLicenseHostCompanyOption } from "@/lib/data/admin-licenses-types";

type CompanyScopedCreateCompanyActionProps = {
  hostCompanies: AdminLicenseHostCompanyOption[];
};

export function CompanyScopedCreateCompanyAction({
  hostCompanies
}: CompanyScopedCreateCompanyActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [hostCompanyId, setHostCompanyId] = useState(hostCompanies[0]?.id ?? "");
  const [seatsPurchased, setSeatsPurchased] = useState("");
  const [licenseStatus, setLicenseStatus] = useState<"active" | "trial" | "expired">("active");
  const [revenue, setRevenue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function closeModal() {
    setOpen(false);
    setCompanyName("");
    setHostCompanyId(hostCompanies[0]?.id ?? "");
    setSeatsPurchased("");
    setLicenseStatus("active");
    setRevenue("");
    setSubmitting(false);
    setErrorMessage(null);
  }

  async function handleSubmit() {
    if (submitting) return;

    const parsedSeats = Number(seatsPurchased);
    const parsedRevenue = revenue.trim() ? Number(revenue) : 0;

    if (!companyName.trim()) {
      setErrorMessage("Company name is required.");
      return;
    }
    if (!hostCompanyId) {
      setErrorMessage("Billing organization is required.");
      return;
    }
    if (!Number.isInteger(parsedSeats) || parsedSeats <= 0) {
      setErrorMessage("Seats must be a whole number greater than 0.");
      return;
    }
    if (!Number.isFinite(parsedRevenue) || parsedRevenue < 0) {
      setErrorMessage("Revenue must be a positive number.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/v1/exhibitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostCompanyId,
          exhibitorName: companyName.trim(),
          seatsPurchased: parsedSeats,
          licenseStatus,
          revenue: parsedRevenue
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        setErrorMessage(payload.message ?? "Failed to create company.");
        return;
      }

      closeModal();
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create company.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700"
      >
        + Add Company
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="border-b border-border px-6 py-6 sm:px-8">
              <h2 className="text-4xl font-bold">Add Company</h2>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Company Name *</span>
                <input
                  value={companyName}
                  onChange={(event) => {
                    setCompanyName(event.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="e.g., Acme Labs"
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Company License Seats *</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={seatsPurchased}
                  onChange={(event) => {
                    setSeatsPurchased(event.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="e.g., 10"
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">License Status *</span>
                <select
                  value={licenseStatus}
                  onChange={(event) => {
                    setLicenseStatus(event.target.value as "active" | "trial" | "expired");
                    setErrorMessage(null);
                  }}
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="expired">Expired</option>
                </select>
              </label>

              <label className="block space-y-2.5">
                <span className="text-sm font-semibold text-slate-700">Revenue (USD)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={revenue}
                  onChange={(event) => {
                    setRevenue(event.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder="Defaults to 0"
                  className="h-14 w-full rounded-2xl border border-border px-4 text-base focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>

              {errorMessage ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {errorMessage}
                </p>
              ) : null}
            </div>

            <div className="border-t border-border px-6 py-5 sm:px-8">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-14 rounded-2xl bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="h-14 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create Company"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
