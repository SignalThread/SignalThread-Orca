import { Suspense } from "react";
import { ImportWizardFlow } from "@/components/import-wizard/import-wizard-flow";
import { requireRole } from "@/lib/auth/session";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";

/**
 * Pre-event import workflow for exhibitor admins.
 */
export default async function ExhibitorImportWizardPage() {
  const sessionUser = await requireRole("exhibitor_admin");
  const activeEventId = await resolveExhibitorAppActiveEventId(sessionUser.id, null);

  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-card px-4 py-16 text-center text-sm text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          Loading import wizard…
        </div>
      }
    >
      <ImportWizardFlow sessionUserId={sessionUser.id} activeEventId={activeEventId} />
    </Suspense>
  );
}
