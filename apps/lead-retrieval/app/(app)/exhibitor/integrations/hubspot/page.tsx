import Link from "next/link";
import { HubSpotDisconnectButton } from "@/components/exhibitor/hubspot-disconnect-button";
import { HubSpotManualSync } from "@/components/admin/hubspot-manual-sync";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildHubSpotConnectUrl } from "@/lib/integrations/hubspot/oauth";

type HubSpotIntegrationRow = {
  id: string;
  provider_account_id: string | null;
  scope: string[] | null;
};

export default async function ExhibitorHubSpotIntegrationPage() {
  const sessionUser = await requireRole("exhibitor_admin");
  const accountId = sessionUser.company_id;
  const connectUrl = buildHubSpotConnectUrl({ accountId });

  let integration: HubSpotIntegrationRow | null = null;
  let lookupError: string | null = null;

  if (accountId) {
    const supabase = createAdminClient();
    const { data, error } = await (supabase as any)
      .from("integrations")
      .select("id, provider_account_id, scope")
      .eq("provider", "hubspot")
      .eq("account_id", accountId)
      .maybeSingle();

    if (error) {
      lookupError = error.message ?? "Failed to load integration status.";
    } else {
      integration = (data as HubSpotIntegrationRow | null) ?? null;
    }
  }

  const isConnected = Boolean(integration);
  const scopes = integration?.scope ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">HubSpot Integration</h1>
          <p className="text-slate-600">
            Manage your HubSpot connection for this exhibitor account.
          </p>
        </div>
        <Link
          href="/exhibitor/integrations"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to Integrations
        </Link>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#ff7a00] text-white shadow-[0_8px_18px_rgba(255,122,0,0.32)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
                <circle cx="17.5" cy="6.5" r="2.2" fill="currentColor" />
                <circle cx="18.8" cy="13.5" r="1.5" fill="currentColor" />
                <circle cx="7.8" cy="5.8" r="1.3" fill="currentColor" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-4xl font-bold tracking-tight text-slate-900">HubSpot</h2>
              <p className="max-w-2xl text-lg text-slate-600">
                {isConnected
                  ? "Sync captured leads from SignalThread Lead Retrieval into HubSpot contacts."
                  : "Connect your HubSpot account to start syncing SignalThread Lead Retrieval leads into your CRM."}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold ${
                isConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-600" : "bg-slate-500"}`} />
              {isConnected ? "Connected" : "Not connected"}
            </span>
            {isConnected ? <HubSpotDisconnectButton /> : null}
          </div>
        </div>

        {isConnected ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">
                  HubSpot Account
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {integration?.provider_account_id ?? "Not reported"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">
                  Granted Scopes
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {scopes.length.toLocaleString("en-US")}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">
                Granted Scopes
              </p>
              {scopes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {scopes.map((scope, index) => (
                    <span
                      key={`${scope}-${index}`}
                      className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No scopes stored.</p>
              )}
            </div>

            <HubSpotManualSync />
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Setup required</p>
            <p className="mt-2 text-sm text-slate-600">
              Connect your HubSpot account to start syncing SignalThread Lead Retrieval leads into your CRM.
            </p>
            <a
              href={connectUrl ?? "#"}
              className={`mt-4 inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold ${
                connectUrl
                  ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
                  : "cursor-not-allowed border border-slate-300 text-slate-400"
              }`}
              aria-disabled={!connectUrl}
            >
              Connect your HubSpot account
            </a>
            <p className="mt-2 text-xs text-slate-500">
              You’ll be redirected to HubSpot to sign in and choose the account you want to connect.
            </p>
          </div>
        )}

        {lookupError ? (
          <p className="mt-4 text-sm font-medium text-rose-700">{lookupError}</p>
        ) : null}
      </article>
    </section>
  );
}
