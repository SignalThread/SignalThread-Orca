import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { WorkflowBuilderForm } from "@/components/exhibitor/workflows/workflow-builder-form";
import { loadWorkflowBuilderCrmBundle } from "@/lib/exhibitor/workflows/load-workflow-builder-crm";
import { loadWorkflowBuilderEnrichmentBundle } from "@/lib/exhibitor/workflows/load-workflow-builder-enrichment";
import { loadWorkflowBuilderSignalsForUser } from "@/lib/exhibitor/workflows/load-workflow-builder-signals";
import { resolveWorkflowAuthoringEventContext } from "@/lib/exhibitor/workflows/workflow-authoring-event-context";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  eventId?: string | string[];
  scope?: string | string[];
};

function BuilderFormFallback() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200/90 bg-white/80 p-8 shadow-sm">
      <div className="mb-6 h-8 w-48 rounded-lg bg-slate-200/80" />
      <div className="mx-auto max-w-md space-y-4">
        <div className="h-36 rounded-2xl bg-slate-100" />
        <div className="mx-auto h-10 w-px bg-slate-200" />
        <div className="h-44 rounded-2xl bg-slate-100" />
      </div>
    </div>
  );
}

export default async function ExhibitorWorkflowNewPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  if (!isWorkflowsEnabled()) {
    redirect("/exhibitor/dashboard");
  }

  const resolved = (await searchParams) ?? {};
  const urlEventRaw = Array.isArray(resolved.eventId) ? resolved.eventId[0] : resolved.eventId;
  const urlEventStr = String(urlEventRaw ?? "").trim();
  const scopeRaw = Array.isArray(resolved.scope) ? resolved.scope[0] : resolved.scope;
  const sessionUser = await requireRole("exhibitor_admin");
  const eventContext = await resolveWorkflowAuthoringEventContext({
    userId: sessionUser.id,
    urlEventId: urlEventStr.length > 0 ? urlEventStr : null,
    scope: scopeRaw
  });
  const eventIdForSignalInventory = eventContext.eventId;

  const [signals, enrichment, crm] = await Promise.all([
    loadWorkflowBuilderSignalsForUser(sessionUser, { eventId: eventIdForSignalInventory }),
    loadWorkflowBuilderEnrichmentBundle(String(sessionUser.company_id ?? "")),
    loadWorkflowBuilderCrmBundle(String(sessionUser.company_id ?? ""))
  ]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-8 text-slate-800 md:px-6">
      <Suspense fallback={<BuilderFormFallback />}>
        <WorkflowBuilderForm
          signals={signals}
          enrichmentProviders={enrichment.providers}
          workspaceDefaultAdapterKey={enrichment.workspaceDefaultAdapterKey}
          crmProviders={crm.providers}
          eventId={eventIdForSignalInventory}
          scopeMode={eventContext.scopeMode}
        />
      </Suspense>
    </div>
  );
}
