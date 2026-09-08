"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function HubSpotDisconnectButton() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disconnect = () => {
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/exhibitor/integrations/hubspot/disconnect", {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          disconnected?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.success || !payload.disconnected) {
          setError(payload.error ?? "Unable to disconnect HubSpot. Try again in a moment.");
          return;
        }

        setDialogOpen(false);
        router.refresh();
      } catch (disconnectError) {
        setError(
          disconnectError instanceof Error
            ? disconnectError.message
            : "Unable to disconnect HubSpot. Try again in a moment."
        );
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setDialogOpen(true);
        }}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        Disconnect HubSpot
      </button>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hubspot-disconnect-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 id="hubspot-disconnect-title" className="text-xl font-bold text-slate-950">
              Disconnect HubSpot?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This will remove the HubSpot connection for this exhibitor account. Existing leads in SignalThread will
              remain unchanged, but new syncs to HubSpot will stop until HubSpot is reconnected.
            </p>

            {error ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setDialogOpen(false);
                  setError(null);
                }}
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Disconnecting..." : "Disconnect HubSpot"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
