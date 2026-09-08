"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipedriveLeadSyncState } from "@/lib/integrations/pipedrive/sync-state";

export function PipedriveLeadSyncControl({
  leadId,
  connected,
  initialState
}: {
  leadId: string;
  connected: boolean;
  initialState: PipedriveLeadSyncState;
}) {
  const router = useRouter();
  const [state, setState] = useState<PipedriveLeadSyncState>(initialState);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!connected) return null;

  async function send() {
    if (sending) return;
    setSending(true);
    setError(null);
    setState("syncing");
    try {
      const response = await fetch("/api/integrations/pipedrive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId })
      });
      const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (result.success) {
        setState("synced");
      } else {
        setState("failed");
        setError(result.error ?? "Pipedrive sync failed.");
      }
      router.refresh();
    } catch {
      setState("failed");
      setError("Pipedrive sync failed.");
    } finally {
      setSending(false);
    }
  }

  if (state === "synced") {
    return (
      <span
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 sm:px-3"
        data-testid="pipedrive-lead-sync-status"
      >
        Synced to Pipedrive
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={sending}
        title={error ?? undefined}
        className={`inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-2.5 text-xs font-semibold shadow-sm transition disabled:opacity-60 sm:px-3 ${
          state === "failed"
            ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
            : "border border-slate-200/90 bg-white text-slate-800 hover:bg-slate-50"
        }`}
        data-testid="pipedrive-lead-sync-action"
      >
        {sending ? "Sending…" : state === "failed" ? "Retry Pipedrive Sync" : "Send to Pipedrive"}
      </button>
    </span>
  );
}
