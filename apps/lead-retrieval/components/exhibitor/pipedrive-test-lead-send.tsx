"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipedriveUnsentLeadOption } from "@/lib/integrations/pipedrive/sync-state";

type TestSyncResult = {
  success?: boolean;
  error?: string;
  personAction?: string | null;
  organizationAction?: string | null;
  destinationKind?: "lead" | "deal" | null;
  destinationAction?: string | null;
  synopsisNoteAction?: string | null;
  emailDraftNoteAction?: string | null;
  activityAction?: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  matched: "Matched existing",
  reused: "Reused from a prior attempt",
  skipped: "Skipped"
};

function describe(action: string | null | undefined) {
  if (!action) return "Skipped";
  return ACTION_LABEL[action] ?? action;
}

export function PipedriveTestLeadSend({ leads }: { leads: PipedriveUnsentLeadOption[] }) {
  const router = useRouter();
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TestSyncResult | null>(null);

  if (leads.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Every recent lead has already been sent to Pipedrive. Capture a new lead to test again.
      </p>
    );
  }

  async function send() {
    if (!leadId || sending) return;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/integrations/pipedrive/test-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId })
      });
      const json = (await response.json().catch(() => ({}))) as TestSyncResult;
      setResult(json);
      router.refresh();
    } catch {
      setResult({ success: false, error: "Pipedrive test send failed." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block max-w-sm flex-1 text-sm font-semibold text-slate-800">
          Choose a lead
          <select
            value={leadId}
            onChange={(event) => {
              setLeadId(event.target.value);
              setResult(null);
            }}
            disabled={sending}
            className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          >
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.fullName ?? lead.email ?? lead.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !leadId}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="pipedrive-send-test-lead"
        >
          {sending ? "Sending…" : "Send Test Lead"}
        </button>
      </div>

      {result ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.success ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
          }`}
          role="status"
          data-testid="pipedrive-test-lead-result"
        >
          <p className={`font-semibold ${result.success ? "text-emerald-800" : "text-rose-800"}`}>
            {result.success ? "Test lead sent to Pipedrive." : (result.error ?? "Pipedrive test send failed.")}
          </p>
          {result.success ? (
            <ul className="mt-2 space-y-1 text-slate-700">
              <li>Person: {describe(result.personAction)}</li>
              <li>Organization: {describe(result.organizationAction)}</li>
              <li>{result.destinationKind === "deal" ? "Deal" : "Lead"}: {describe(result.destinationAction)}</li>
              <li>Conversation synopsis note: {describe(result.synopsisNoteAction)}</li>
              <li>Email draft note: {describe(result.emailDraftNoteAction)}</li>
              <li>Follow-up activity: {describe(result.activityAction)}</li>
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
