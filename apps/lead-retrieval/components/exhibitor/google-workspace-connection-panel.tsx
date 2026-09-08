"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GoogleWorkspaceConnectionStatus } from "@/lib/integrations/google/connection-status";

const CAPABILITIES = [
  ["gmailSend", "Send Gmail follow-ups"],
  ["calendarEventsOwned", "Manage owned calendar events"],
  ["calendarFreeBusy", "Check calendar free/busy"]
] as const;

export function GoogleWorkspaceConnectionPanel({
  status
}: {
  status: GoogleWorkspaceConnectionStatus;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canDisconnect = status.status !== "disconnected";
  const needsReconnect = status.status === "reconnect_required" || status.status === "error" || status.isPartialGrant;
  const connectHref = needsReconnect
    ? "/api/exhibitor/integrations/google/connect?reconnect=1"
    : "/api/exhibitor/integrations/google/connect";

  const disconnect = () => {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/exhibitor/integrations/google/disconnect", {
          method: "POST",
          headers: { Accept: "application/json" }
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          disconnected?: boolean;
          revocationPending?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.success || !payload.disconnected) {
          setError(payload.error ?? "Unable to disconnect Google Workspace.");
          return;
        }
        setDialogOpen(false);
        if (payload.revocationPending) {
          setNotice("The connection is disabled while Google revocation is retried.");
        }
        router.refresh();
      } catch {
        setError("Unable to disconnect Google Workspace. Try again in a moment.");
      }
    });
  };

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_14px_38px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Image
              src="/integrations/google-workspace.png"
              alt="Google Workspace logo"
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-950">Google Workspace</h2>
            <p className="mt-1 max-w-2xl text-slate-600">
              This connection belongs only to your SignalThread user. Credentials remain encrypted and are never sent to the browser.
            </p>
          </div>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ${status.connected && !status.isPartialGrant ? "bg-emerald-100 text-emerald-700" : status.status === "disconnected" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>
          {status.connected && !status.isPartialGrant
            ? "Connected"
            : status.status === "disconnected"
              ? "Not connected"
              : status.isPartialGrant
                ? "Permission required"
              : status.status === "revocation_pending"
                ? "Disconnecting"
                : "Reconnect required"}
        </span>
      </div>

      {status.identity ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Connected Google account</p>
          <p className="mt-2 text-xl font-bold text-slate-950">{status.identity.displayName ?? status.identity.email}</p>
          <p className="text-sm text-slate-600">{status.identity.email}</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {CAPABILITIES.map(([key, label]) => {
          const granted = status.capabilities[key];
          return (
            <div key={key} className={`rounded-2xl border px-4 py-4 ${granted ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <p className={`text-sm font-semibold ${granted ? "text-emerald-800" : "text-slate-600"}`}>
                {granted ? "Granted" : "Not granted"}
              </p>
              <p className="mt-1 text-sm text-slate-700">{label}</p>
            </div>
          );
        })}
      </div>

      {notice ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {status.isPartialGrant ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Google did not grant every requested permission. Calendar free/busy checks are unavailable until you reconnect and approve the requested access.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        {status.status === "disconnected" || needsReconnect ? (
          <a href={connectHref} className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700">
            {status.status === "disconnected" ? "Connect Google Workspace" : "Reconnect Google Workspace"}
          </a>
        ) : null}
        {canDisconnect ? (
          <button type="button" onClick={() => setDialogOpen(true)} className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 px-5 text-sm font-semibold text-rose-700 hover:bg-rose-50">
            {status.status === "revocation_pending" ? "Retry revocation" : "Disconnect"}
          </button>
        ) : null}
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true" aria-labelledby="google-disconnect-title">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="google-disconnect-title" className="text-xl font-bold text-slate-950">Disconnect Google Workspace?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">SignalThread will revoke Google access and remove the encrypted credentials. No lead data is changed.</p>
            {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={isPending} onClick={() => setDialogOpen(false)} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" disabled={isPending} onClick={disconnect} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-60">{isPending ? "Disconnecting..." : "Revoke and disconnect"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
