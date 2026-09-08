"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EXHIBITOR_BRIEFINGS_PATH } from "@/lib/import-wizard/paths";

export function BriefingWorkspaceCancelAction({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmOpen(false);
        setError(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  async function confirmCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/exhibitor/briefings/batches/${encodeURIComponent(batchId)}/cancel-selected-lead-draft`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not cancel this brief.");
      }
      setConfirmOpen(false);
      router.push(`${EXHIBITOR_BRIEFINGS_PATH}#briefings-workspaces`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
        data-testid="selected-lead-brief-cancel-trigger"
        onClick={() => {
          setError(null);
          setConfirmOpen(true);
        }}
      >
        Cancel brief
      </button>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="selected-lead-brief-cancel-title"
          data-testid="selected-lead-brief-cancel-modal"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmOpen(false);
              setError(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 id="selected-lead-brief-cancel-title" className="text-base font-semibold text-slate-900">
              Cancel this brief?
            </h3>
            <p className="mt-3 text-sm text-slate-700">
              This will delete the in-progress brief workspace for these selected leads. Your leads will not be deleted.
            </p>
            {error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                data-testid="selected-lead-brief-cancel-keep"
                disabled={busy}
                onClick={() => {
                  setConfirmOpen(false);
                  setError(null);
                }}
              >
                Keep brief
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                data-testid="selected-lead-brief-cancel-confirm"
                disabled={busy}
                onClick={() => void confirmCancel()}
              >
                {busy ? "Canceling..." : "Cancel brief"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
