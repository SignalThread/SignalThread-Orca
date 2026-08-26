"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/server/admin-actions";

/** Re-derive every user's claim from the registry. Idempotent. */
export function ReconcileButton({ action }: { action: () => Promise<ActionResult> }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setResult(await action());
          setPending(false);
        }}
        className="rounded-md border px-3 py-1.5 text-xs font-medium"
        style={{ borderColor: "var(--border)" }}
      >
        {pending ? "Reconciling…" : "Sync / reconcile all claims"}
      </button>
      {result ? (
        <p role="status" className="text-xs" style={{ color: result.ok ? "var(--signalthread-muted)" : "#b91c1c" }}>
          {result.ok ? result.message : result.error}
          {result.ok && result.refreshRequired
            ? " Signed-in sessions keep previous access until their token refreshes."
            : ""}
        </p>
      ) : null}
    </div>
  );
}
