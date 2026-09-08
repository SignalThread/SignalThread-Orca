"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PickerLead = {
  id: string;
  full_name: string;
  email: string;
  company_text: string;
  job_title: string;
};

function leadLabel(lead: PickerLead): string {
  return lead.full_name || lead.email || "Untitled lead";
}

export function BriefingsLeadPickerLauncher({ eventId }: { eventId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<PickerLead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCount = selectedIds.size;
  const canCreate = selectedCount > 0 && !creating;

  const fetchLeads = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (eventId) params.set("eventId", eventId);
      const res = await fetch(`/api/exhibitor/briefings/lead-picker?${params.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { leads?: PickerLead[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not load leads.");
      }
      setLeads(Array.isArray(json.leads) ? json.leads : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, open, query]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void fetchLeads(), 200);
    return () => window.clearTimeout(t);
  }, [fetchLeads, open]);

  const selectedLeadSummary = useMemo(() => {
    if (selectedCount === 0) return "No leads selected";
    return selectedCount === 1 ? "1 lead selected" : `${selectedCount} leads selected`;
  }, [selectedCount]);

  function toggleLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createBrief() {
    if (selectedIds.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/exhibitor/briefings/from-leads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, leadIds: Array.from(selectedIds) }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        batchId?: string;
        workspaceUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.batchId) {
        throw new Error(json.error ?? "Could not create brief run.");
      }
      router.push(json.workspaceUrl ?? `/exhibitor/briefings/${encodeURIComponent(json.batchId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create brief run.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="briefings-create-from-leads"
        disabled={!eventId}
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        New brief from leads
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="briefings-lead-picker-title"
          data-testid="briefings-lead-picker-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="briefings-lead-picker-title" className="text-base font-semibold text-slate-950">
                  Create brief from leads
                </h3>
                <p className="mt-1 text-sm text-slate-600">Pick one or more existing leads for this event.</p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                disabled={creating}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <label htmlFor="briefings-lead-picker-search" className="sr-only">
                Search leads
              </label>
              <input
                id="briefings-lead-picker-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or company"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                data-testid="briefings-lead-picker-search"
              />
            </div>

            <div className="mt-3 max-h-[22rem] overflow-y-auto rounded-xl border border-slate-200">
              {loading ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Loading leads…</p>
              ) : leads.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">No leads found.</p>
              ) : (
                <ul className="divide-y divide-slate-100" data-testid="briefings-lead-picker-results">
                  {leads.map((lead) => {
                    const checked = selectedIds.has(lead.id);
                    return (
                      <li key={lead.id}>
                        <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={checked}
                            onChange={() => toggleLead(lead.id)}
                            data-testid="briefings-lead-picker-checkbox"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{leadLabel(lead)}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {[lead.email, lead.company_text, lead.job_title].filter(Boolean).join(" · ") || "No details"}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-600">{selectedLeadSummary}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  disabled={creating}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="briefings-lead-picker-create"
                  disabled={!canCreate}
                  onClick={() => void createBrief()}
                >
                  {creating ? "Creating…" : "Create brief"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
