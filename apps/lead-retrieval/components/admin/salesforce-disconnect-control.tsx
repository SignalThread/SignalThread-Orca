"use client";

import { useState } from "react";

type SalesforceDisconnectControlProps = {
  action: () => Promise<void>;
};

export function SalesforceDisconnectControl({ action }: SalesforceDisconnectControlProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        Disconnect
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="salesforce-disconnect-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 id="salesforce-disconnect-title" className="text-xl font-bold text-slate-950">
              Disconnect Salesforce?
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This will remove the Salesforce connection for this account. Existing leads in SignalThread will remain
              unchanged, but new syncs to Salesforce will stop until Salesforce is reconnected.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                Cancel
              </button>
              <form action={action}>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
