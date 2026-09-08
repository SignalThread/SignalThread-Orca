"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  LEAD_TEMPERATURE_LABEL,
  LEAD_TEMPERATURE_VALUES,
  type LeadTemperature
} from "@/lib/leads/temperature";

type Toast = {
  id: number;
  tone: "success" | "error";
  message: string;
};

function optionalText(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function ExhibitorAddLeadButton({
  eventId,
  companyId
}: {
  eventId: string | null;
  companyId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  function pushToast(tone: Toast["tone"], message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

  function showCreatedLead() {
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (companyId) params.set("companyId", companyId);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const fullName = optionalText(data.get("full_name"));
    if (!fullName) {
      pushToast("error", "Full name is required.");
      return;
    }

    const ratingRaw = optionalText(data.get("rating"));
    const temperatureRaw = optionalText(data.get("temperature")) as LeadTemperature | null;
    const followUpDate = optionalText(data.get("follow_up_date"));
    const payload: Record<string, unknown> = {
      full_name: fullName,
      email: optionalText(data.get("email")),
      company_text: optionalText(data.get("company_text")),
      job_title: optionalText(data.get("job_title")),
      event_id: eventId
    };

    if (ratingRaw) payload.rating = Number(ratingRaw);
    if (temperatureRaw) payload.temperature = temperatureRaw;
    if (followUpDate) payload.follow_up_date = followUpDate;

    setSubmitting(true);
    try {
      const response = await fetch("/api/exhibitor/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to create lead.");
      }

      form.reset();
      setOpen(false);
      pushToast("success", "Lead created.");
      showCreatedLead();
    } catch (error) {
      pushToast("error", error instanceof Error ? error.message : "Failed to create lead.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!companyId}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Add lead
      </button>
      <ToastStack toasts={toasts} />
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-lead-title"
            className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-lead-title" className="text-xl font-bold text-slate-950">
                  Add lead
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Create a lead in the current exhibitor scope.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!submitting) setOpen(false);
                }}
                disabled={submitting}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close
              </button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={submit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="full_name" label="Full name" required />
                <TextField name="email" label="Email" type="email" />
                <TextField name="company_text" label="Company" />
                <TextField name="job_title" label="Title" />
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rating</span>
                  <select
                    name="rating"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                    defaultValue=""
                  >
                    <option value="">Unrated</option>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating} star{rating === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Temperature</span>
                  <select
                    name="temperature"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                    defaultValue=""
                  >
                    <option value="">Unassessed</option>
                    {LEAD_TEMPERATURE_VALUES.map((temperature) => (
                      <option key={temperature} value={temperature}>
                        {LEAD_TEMPERATURE_LABEL[temperature]}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField name="follow_up_date" label="Follow-up date" type="date" />
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Creating..." : "Create lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TextField({
  name,
  label,
  type = "text",
  required = false
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
      />
    </label>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed right-4 top-4 z-[60] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
