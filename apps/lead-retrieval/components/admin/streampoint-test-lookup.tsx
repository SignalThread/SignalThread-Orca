"use client";

import { useState } from "react";

type LookupResponse = {
  success?: boolean;
  error?: string;
  person?: {
    fullName?: string | null;
    email?: string | null;
    companyName?: string | null;
    badgeId?: string | null;
    confirmationId?: string | null;
  };
};

export function StreampointTestLookupPanel({ eventId }: { eventId: string }) {
  const [confirmationId, setConfirmationId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);

  async function handleLookup() {
    const trimmed = confirmationId.trim();
    if (!trimmed || isLoading || !eventId) return;

    setIsLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/integrations/streampoint/test-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ confirmationId: trimmed, eventId })
      });

      const payload = (await response.json().catch(() => ({}))) as LookupResponse;
      if (!response.ok || !payload.success) {
        setResult({ success: false, error: payload.error ?? "Lookup failed." });
      } else {
        setResult(payload);
      }
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : "Lookup failed." });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={confirmationId}
          onChange={(event) => setConfirmationId(event.target.value)}
          placeholder="Enter confirmation ID"
          className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={!confirmationId.trim() || isLoading || !eventId}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Testing..." : "Run Lookup"}
        </button>
      </div>

      {result?.success && result.person ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-semibold">Lookup successful</p>
          <p className="mt-1">Name: {result.person.fullName || "N/A"}</p>
          <p>Email: {result.person.email || "N/A"}</p>
          <p>Company: {result.person.companyName || "N/A"}</p>
          <p>Badge ID: {result.person.badgeId || "N/A"}</p>
          <p>Confirmation: {result.person.confirmationId || "N/A"}</p>
        </div>
      ) : null}

      {result && !result.success ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          {result.error ?? "Lookup failed."}
        </div>
      ) : null}
    </div>
  );
}
