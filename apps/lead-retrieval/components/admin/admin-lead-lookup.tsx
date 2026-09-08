"use client";

import { useEffect, useRef, useState } from "react";

type SearchLead = {
  id: string;
  full_name: string;
  email: string;
  company_text: string;
  job_title: string;
};

function leadDisplayText(lead: SearchLead) {
  const name = lead.full_name || "Unnamed lead";
  const company = lead.company_text || "Unknown company";
  return `${name} • ${company}`;
}

export function AdminLeadLookup({ salesforceConnected }: { salesforceConnected: boolean }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<SearchLead | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<{
    salesforceLeadId: string | null;
    action: "created" | "updated" | null;
  } | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let ignore = false;

    async function runSearch() {
      if (!debouncedQuery || selectedLead) {
        setResults([]);
        setSearchError(null);
        setSearching(false);
        return;
      }

      setSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/admin/leads/search?q=${encodeURIComponent(debouncedQuery)}`,
          { method: "GET" }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          leads?: SearchLead[];
          error?: string;
        };

        if (!response.ok) {
          if (!ignore) {
            setResults([]);
            setSearchError(payload.error ?? "Failed to search leads.");
          }
          return;
        }

        if (!ignore) {
          setResults(Array.isArray(payload.leads) ? payload.leads : []);
          setSearchError(null);
        }
      } catch (error) {
        if (!ignore) {
          setResults([]);
          setSearchError(error instanceof Error ? error.message : "Failed to search leads.");
        }
      } finally {
        if (!ignore) {
          setSearching(false);
        }
      }
    }

    void runSearch();

    return () => {
      ignore = true;
    };
  }, [debouncedQuery, selectedLead]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const showDropdown = dropdownOpen && !selectedLead && query.trim().length > 0;
  const noResults = showDropdown && !searching && !searchError && results.length === 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">
        Test with a lead
      </p>
      <p className="mt-1 text-base text-slate-700">
        Choose one Lead Retrieval record to preview or test your Salesforce sync.
      </p>

      <div className="mt-4 space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 z-10 inline-flex items-center text-slate-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            type="text"
            value={query}
            onFocus={() => {
              if (blurTimeoutRef.current) {
                clearTimeout(blurTimeoutRef.current);
              }
              setDropdownOpen(true);
            }}
            onBlur={() => {
              blurTimeoutRef.current = setTimeout(() => setDropdownOpen(false), 120);
            }}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              if (selectedLead) {
                setSelectedLead(null);
              }
              setSyncError(null);
              setSyncSuccess(null);
            }}
            placeholder="Search by lead name, email, or company"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            autoComplete="off"
          />

          {showDropdown ? (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_28px_rgba(15,23,42,0.14)]">
              {searching ? (
                <div className="px-4 py-3 text-sm text-slate-500">Searching leads...</div>
              ) : null}
              {!searching && searchError ? (
                <div className="px-4 py-3 text-sm text-rose-700">{searchError}</div>
              ) : null}
              {noResults ? (
                <div className="px-4 py-3 text-sm text-slate-500">No matching leads</div>
              ) : null}
              {!searching && !searchError
                ? results.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSelectedLead(lead);
                        setQuery(leadDisplayText(lead));
                        setDropdownOpen(false);
                        setResults([]);
                        setSyncError(null);
                        setSyncSuccess(null);
                      }}
                    >
                      <p className="font-semibold text-slate-900">{lead.full_name || "Unnamed lead"}</p>
                      <p className="text-sm text-slate-600">
                        {[lead.email, lead.company_text].filter(Boolean).join(" • ") || "No email/company"}
                      </p>
                      {lead.job_title ? (
                        <p className="text-xs text-slate-500">{lead.job_title}</p>
                      ) : null}
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>

        {selectedLead ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
            <p className="font-semibold text-emerald-900">Selected lead record</p>
            <p className="text-emerald-800">{leadDisplayText(selectedLead)}</p>
            <p className="mt-1 text-emerald-700">
              Use this lead to preview or test your Salesforce sync.
            </p>
          </div>
        ) : null}

        {selectedLead && salesforceConnected ? (
          <button
            type="button"
            onClick={async () => {
              if (!selectedLead || isSending) return;
              setIsSending(true);
              setSyncError(null);
              setSyncSuccess(null);

              try {
                const response = await fetch("/api/integrations/salesforce/test-sync", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ leadId: selectedLead.id }),
                });

                const payload = (await response.json().catch(() => ({}))) as {
                  success?: boolean;
                  error?: string;
                  action?: "created" | "updated";
                  salesforceLeadId?: string | null;
                };

                if (!response.ok || !payload.success) {
                  setSyncError(payload.error ?? "Failed to sync test lead to Salesforce.");
                } else {
                  setSyncSuccess({
                    salesforceLeadId: payload.salesforceLeadId ?? null,
                    action: payload.action ?? null,
                  });
                }
              } catch (error) {
                setSyncError(
                  error instanceof Error ? error.message : "Failed to sync test lead to Salesforce."
                );
              } finally {
                setIsSending(false);
              }
            }}
            disabled={isSending}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending
              ? "Sending..."
              : syncSuccess
                ? "Sent to Salesforce"
                : "Send test lead to Salesforce"}
          </button>
        ) : null}

        {syncSuccess && salesforceConnected ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <p className="font-semibold text-emerald-900">Lead successfully synced to Salesforce.</p>
            <p className="mt-1">
              Salesforce Lead ID: {syncSuccess.salesforceLeadId ?? "Not returned"}
            </p>
            <p>
              {syncSuccess.action === "updated"
                ? "Updated existing Salesforce Lead."
                : "Created new Salesforce Lead."}
            </p>
          </div>
        ) : null}

        {syncError && salesforceConnected ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {syncError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
