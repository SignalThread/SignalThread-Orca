import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminLeadLookup } from "@/components/admin/admin-lead-lookup";
import { SalesforceDisconnectControl } from "@/components/admin/salesforce-disconnect-control";
import { getValidSalesforceConnectionForCompany } from "@/lib/integrations/salesforce/client";

type SalesforceIntegrationRow = {
  id: string;
  provider: string;
  provider_account_id: string | null;
  scope: string[] | null;
  expires_at: string | null;
  updated_at: string | null;
  last_refresh_attempt_at: string | null;
  last_sync_error: string | null;
  has_refresh_token?: boolean;
};

type SalesforceSetupConfigRow = {
  id: string;
  sync_target_object: "lead" | "contact" | "campaign_member" | null;
  sync_behavior: "create_only" | "update_existing" | "upsert_by_email" | null;
  campaign_name: string | null;
  is_configured: boolean;
  updated_at: string | null;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function salesforceDestinationLabel(value: string | null | undefined) {
  if (!value) {
    return "Salesforce org connected";
  }

  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host || "Salesforce org connected";
  } catch {
    return "Salesforce org connected";
  }
}

function SalesforceSetupHeader({ integrationsHref }: { integrationsHref: string }) {
  return (
    <div className="space-y-3">
      <Link
        href={integrationsHref}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950"
      >
        <span aria-hidden>←</span>
        Back to Integrations
      </Link>
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">Salesforce Connection</h1>
        <p className="mt-3 max-w-3xl text-lg leading-8 text-slate-600">
          Connect Salesforce so captured leads can be sent to your CRM.
        </p>
      </div>
    </div>
  );
}

export default async function SalesforceSetupPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; disconnected?: string; error?: string; reason?: string }>;
}) {
  const sessionUser = await requireAuth();

  if (sessionUser.role !== "platform_admin" && sessionUser.role !== "exhibitor_admin") {
    redirect("/app");
  }

  const integrationsHref = sessionUser.role === "platform_admin" ? "/admin/integrations" : "/exhibitor/integrations";

  if (!sessionUser.company_id) {
    return (
      <section className="space-y-6">
        <SalesforceSetupHeader integrationsHref={integrationsHref} />
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Your admin user is not linked to an account, so Salesforce setup cannot be saved.
        </p>
      </section>
    );
  }

  const supabase = createAdminClient();

  const { data: integrationData } = await (supabase as any)
    .from("integrations")
    .select("id, provider, provider_account_id, scope, expires_at, updated_at, last_refresh_attempt_at, last_sync_error, refresh_token")
    .eq("account_id", sessionUser.company_id)
    .eq("provider", "salesforce")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: configData } = await (supabase as any)
    .from("integration_sync_configs")
    .select("id, sync_target_object, sync_behavior, campaign_name, is_configured, updated_at")
    .eq("account_id", sessionUser.company_id)
    .eq("provider", "salesforce")
    .maybeSingle();

  const rawIntegration = (integrationData as (SalesforceIntegrationRow & { refresh_token?: string | null }) | null) ?? null;
  const integration = rawIntegration
    ? {
        ...rawIntegration,
        has_refresh_token: Boolean(String(rawIntegration.refresh_token ?? "").trim())
      }
    : null;
  const config = (configData as SalesforceSetupConfigRow | null) ?? null;
  const connectionHealth = await getValidSalesforceConnectionForCompany(sessionUser.company_id).catch((error) => ({
    ok: false as const,
    reason: "refresh_failed" as const,
    message: error instanceof Error ? error.message : "Failed to evaluate Salesforce connection health.",
    safeDetails: {
      connectionId: integration?.id ?? null,
      provider: "salesforce" as const,
      instanceUrl: integration?.provider_account_id ?? null,
      expiresAt: integration?.expires_at ?? null,
      hasRefreshToken: Boolean(integration?.has_refresh_token),
      lastRefreshAttemptAt: integration?.last_refresh_attempt_at ?? null,
      lastSyncError: integration?.last_sync_error ?? null
    }
  }));
  const connected = connectionHealth.ok;
  const hasConnectionRow = Boolean(integration);
  const configured = Boolean(config?.is_configured || (config?.sync_target_object && config?.sync_behavior));
  const resolvedSearchParams = (await searchParams) ?? {};
  const connectButtonLabel = hasConnectionRow ? "Reconnect Salesforce" : "Connect Salesforce";

  async function disconnectSalesforce() {
    "use server";

    const session = await requireAuth();
    if (session.role !== "platform_admin" && session.role !== "exhibitor_admin") {
      redirect("/app");
    }
    if (!session.company_id) {
      redirect("/admin/integrations/salesforce/setup?error=missing_account");
    }

    const adminClient = createAdminClient();
    const [{ error: integrationDeleteError }, { error: configDeleteError }] = await Promise.all([
      (adminClient as any)
        .from("integrations")
        .delete()
        .eq("account_id", session.company_id)
        .eq("provider", "salesforce"),
      (adminClient as any)
        .from("integration_sync_configs")
        .delete()
        .eq("account_id", session.company_id)
        .eq("provider", "salesforce"),
    ]);

    if (integrationDeleteError || configDeleteError) {
      redirect("/admin/integrations/salesforce/setup?error=disconnect_failed");
    }

    redirect("/admin/integrations/salesforce/setup?disconnected=1");
  }

  return (
    <section className="space-y-6">
      <SalesforceSetupHeader integrationsHref={integrationsHref} />

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-indigo-600">Connection status</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {connected ? "Salesforce is connected" : hasConnectionRow ? "Reconnect Salesforce" : "Connect Salesforce"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {connected
                ? "Lead Retrieval can send leads to the Salesforce account you authorized."
                : hasConnectionRow
                  ? connectionHealth.message
                : "Authorize Salesforce to start sending captured leads to your CRM."}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              connected
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : hasConnectionRow
                  ? "border border-amber-200 bg-amber-50 text-amber-700"
                : "border border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-emerald-500" : hasConnectionRow ? "bg-amber-500" : "bg-slate-400"
              }`}
            />
            {connected ? "Connected" : hasConnectionRow ? "Reconnect required" : "Not connected"}
          </span>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">Connected account</dt>
            <dd className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              Salesforce
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">Last updated</dt>
            <dd className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              {formatTimestamp(integration?.updated_at ?? null)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">Destination</dt>
            <dd className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
              {hasConnectionRow ? salesforceDestinationLabel(integration?.provider_account_id) : "Not connected yet"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-start gap-3">
          <div>
            <a
              href="/api/integrations/salesforce/connect"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
            >
              {connectButtonLabel}
            </a>
            <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
              Use this if your Salesforce permissions changed or sync stops working.
            </p>
          </div>
          {hasConnectionRow ? (
            <SalesforceDisconnectControl action={disconnectSalesforce} />
          ) : null}
        </div>

        {hasConnectionRow ? (
          <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Technical details</summary>
            <dl className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connection ID</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {connectionHealth.safeDetails.connectionId ?? integration?.id ?? "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-900">salesforce</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instance URL</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {connectionHealth.safeDetails.instanceUrl ?? integration?.provider_account_id ?? "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expires at</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {formatTimestamp(connectionHealth.safeDetails.expiresAt ?? integration?.expires_at ?? null)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Has refresh token</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {connectionHealth.safeDetails.hasRefreshToken || integration?.has_refresh_token ? "true" : "false"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last refresh attempt</dt>
                <dd className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {formatTimestamp(
                    connectionHealth.safeDetails.lastRefreshAttemptAt ??
                      integration?.last_refresh_attempt_at ??
                      null
                  )}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last sync error</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-900">
                  {connectionHealth.safeDetails.lastSyncError ?? integration?.last_sync_error ?? "N/A"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scopes</dt>
                {integration?.scope?.length ? (
                  <dd className="mt-2 flex flex-wrap gap-2">
                    {integration.scope.map((scope) => (
                      <span
                        key={scope}
                        className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {scope}
                      </span>
                    ))}
                  </dd>
                ) : (
                  <dd className="mt-2 text-sm text-slate-500">No scopes recorded.</dd>
                )}
              </div>
            </dl>
          </details>
        ) : null}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-slate-950">Sync settings</h3>
            <p className="mt-1 text-sm text-slate-600">
              Choose how Lead Retrieval should create or update records in Salesforce.
            </p>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {configured ? "Ready" : "Setup required"}
          </span>
        </div>

        <form method="post" action="/api/admin/integrations/salesforce/setup" className="mt-5 space-y-4">
          <div className="space-y-2">
            <label htmlFor="syncTargetObject" className="text-sm font-semibold text-slate-800">
              Create records as
            </label>
            <select
              id="syncTargetObject"
              name="syncTargetObject"
              defaultValue={config?.sync_target_object ?? "lead"}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="lead">Salesforce Lead</option>
              <option value="contact">Salesforce Contact</option>
              <option value="campaign_member">Salesforce Campaign Member</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="syncBehavior" className="text-sm font-semibold text-slate-800">
              When a matching email already exists
            </label>
            <select
              id="syncBehavior"
              name="syncBehavior"
              defaultValue={config?.sync_behavior ?? "upsert_by_email"}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
            >
              <option value="create_only">Create a new lead only</option>
              <option value="update_existing">Update existing lead</option>
              <option value="upsert_by_email">Update existing lead by email</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="campaignName" className="text-sm font-semibold text-slate-800">
              Campaign or source label
            </label>
            <input
              id="campaignName"
              name="campaignName"
              type="text"
              defaultValue={config?.campaign_name ?? ""}
              placeholder="Campaign name or mapping rule"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-500">
              Optional. Use this to tag leads from a specific event, campaign, or import.
            </p>
          </div>

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
          >
            Save settings
          </button>

          <p className="text-xs text-slate-500">Config last updated: {formatTimestamp(config?.updated_at ?? null)}</p>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
        <AdminLeadLookup salesforceConnected={connected} />
      </article>

      {resolvedSearchParams.saved === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Salesforce setup saved.
        </p>
      ) : null}
      {resolvedSearchParams.disconnected === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Salesforce disconnected.
        </p>
      ) : null}
      {resolvedSearchParams.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {resolvedSearchParams.error === "invalid_setup"
            ? "Please select a valid sync target object and sync behavior."
            : resolvedSearchParams.error === "missing_account"
              ? "Your account context is missing."
              : resolvedSearchParams.error === "save_failed"
                ? `Failed to save Salesforce setup.${
                    process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                      ? ` Reason: ${resolvedSearchParams.reason}`
                      : ""
                  }`
                : resolvedSearchParams.error === "disconnect_failed"
                  ? "Failed to disconnect Salesforce."
                  : "Salesforce setup request failed."}
        </p>
      ) : null}
    </section>
  );
}
