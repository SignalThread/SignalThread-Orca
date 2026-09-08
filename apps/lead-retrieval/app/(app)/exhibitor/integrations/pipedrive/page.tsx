import Link from "next/link";
import { PipedriveSetupForm } from "@/components/exhibitor/pipedrive-setup-form";
import { PipedriveTestLeadSend } from "@/components/exhibitor/pipedrive-test-lead-send";
import { requireRole } from "@/lib/auth/session";
import { DEFAULT_PIPEDRIVE_SETUP_SETTINGS } from "@/lib/integrations/pipedrive/setup-core";
import { getPipedriveSetupPageData } from "@/lib/integrations/pipedrive/setup-service";
import { listUnsentPipedriveLeadsForCompany } from "@/lib/integrations/pipedrive/sync-state";

function errorMessage(error: string | undefined) {
  switch (error) {
    case "not_connected": return "Connect Pipedrive before saving setup.";
    case "invalid_destination": return "Choose Leads or Deals.";
    case "missing_deal_destination": return "Choose a pipeline and stage for Deals.";
    case "invalid_pipeline": return "Choose a current Pipedrive pipeline.";
    case "invalid_stage": return "Choose a stage from the selected pipeline.";
    case "missing_owner": return "Choose a Pipedrive owner.";
    case "invalid_owner": return "Choose a current Pipedrive user.";
    default: return "Pipedrive setup could not be saved. Please try again.";
  }
}

export default async function ExhibitorPipedriveSetupPage({
  searchParams
}: {
  searchParams?: Promise<{ saved?: string; error?: string; pipedrive?: string }>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const companyId = String(sessionUser.company_id ?? "").trim();
  const params = (await searchParams) ?? {};

  if (!companyId) {
    return (
      <section className="space-y-6">
        <PipedriveSetupHeading />
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Your current company context is missing, so Pipedrive cannot be configured.
        </p>
      </section>
    );
  }

  let data: Awaited<ReturnType<typeof getPipedriveSetupPageData>> | null = null;
  try {
    data = await getPipedriveSetupPageData(companyId);
  } catch {
    data = null;
  }

  const connection = data?.connection ?? null;
  const connected = Boolean(connection?.connected);
  const accountName = connection?.accountName ?? connection?.accountId ?? "your Pipedrive account";
  const options = data?.options;
  const settings = data?.settings ?? DEFAULT_PIPEDRIVE_SETUP_SETTINGS;
  const unsentLeads = connected
    ? await listUnsentPipedriveLeadsForCompany(companyId).catch(() => [])
    : [];

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PipedriveSetupHeading />

      {params.saved === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          Pipedrive setup saved.
        </p>
      ) : null}
      {params.pipedrive === "connected" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          Pipedrive connected and verified. Configure delivery behavior below.
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {errorMessage(params.error)}
        </p>
      ) : null}

      {!connected ? (
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-bold text-slate-900">Pipedrive is not connected</h2>
          <p className="mt-2 text-sm text-slate-700">Connect a verified Pipedrive account before configuring lead delivery.</p>
          <Link href="/exhibitor/integrations" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700">
            Back to Integrations
          </Link>
        </article>
      ) : (
        <>
          <article className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Connected</p>
            <p className="mt-2 text-lg font-bold text-slate-900">Connected to: {accountName}</p>
            <p className="mt-1 text-sm text-slate-600">Configure how Lead Retrieval should send leads to Pipedrive.</p>
          </article>

          {data?.optionsError || !options ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              Pipedrive connection options could not be loaded. You can keep using Leads and the connected user, or reconnect Pipedrive if this continues.
            </p>
          ) : null}

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <PipedriveSetupForm
              settings={settings}
              pipelines={options?.pipelines ?? []}
              stages={options?.stages ?? []}
              users={options?.users ?? []}
              providerOptionsAvailable={Boolean(options)}
            />
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <h2 className="text-lg font-bold text-slate-900">Test your setup</h2>
            <p className="mt-1 text-sm text-slate-600">
              Send one existing lead through the real Pipedrive delivery to verify your setup before bulk-syncing the rest.
            </p>
            <div className="mt-4">
              <PipedriveTestLeadSend leads={unsentLeads} />
            </div>
          </article>
        </>
      )}
    </section>
  );
}

function PipedriveSetupHeading() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Pipedrive</h1>
        <p className="mt-1 text-slate-600">Set up the future destination for captured leads.</p>
      </div>
      <Link href="/exhibitor/integrations" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
        Back to Integrations
      </Link>
    </div>
  );
}
