import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type ApolloIntegrationRow = {
  access_token: string | null;
  updated_at: string | null;
  provider_account_id: string | null;
};

function maskApiKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function formatTimestamp(value: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ApolloConnectionTestBanner({
  enrich,
  search,
  enrichDetail,
  searchDetail,
}: {
  enrich?: string;
  search?: string;
  enrichDetail?: string;
  searchDetail?: string;
}) {
  const e = enrich ?? "";
  const s = search ?? "";
  const enrichOk = e === "ok";

  const enrichMessage =
    e === "ok"
      ? "Enrichment available — API key accepted for People Enrichment."
      : e === "invalid"
        ? "API key invalid — Apollo returned 401 on People Enrichment."
        : e === "denied"
          ? "Key valid but your account or plan cannot access People Enrichment (403), or Apollo blocked this endpoint."
          : e === "error"
            ? "People Enrichment request failed (non-401/403 error)."
            : "People Enrichment result unknown — re-run the test.";

  const searchMessage =
    s === "ok"
      ? "Search available — this key can call People Search."
      : s === "master"
        ? "Search requires a master API key — People Search is not enabled for this API key (403 API_INACCESSIBLE). Net-new list building via Search needs a master key or a plan that includes it; lead enrichment may still work if Enrichment is available above."
        : s === "skipped"
          ? enrichOk
            ? "People Search was not tested."
            : "Not tested — People Enrichment did not succeed, so Search was skipped."
          : s === "invalid"
            ? "API key invalid — Apollo returned 401 on People Search."
            : s === "denied"
              ? "Key valid but your account or plan cannot access People Search (403)."
              : s === "error"
                ? "People Search request failed (non-401/403 error)."
                : "People Search result unknown — re-run the test.";

  const searchOk = s === "ok";
  const panelClass =
    enrichOk && searchOk
      ? "border-emerald-200 bg-emerald-50"
      : enrichOk
        ? "border-amber-200 bg-amber-50"
        : "border-rose-200 bg-rose-50";
  const headingClass =
    enrichOk && searchOk ? "text-emerald-900" : enrichOk ? "text-amber-900" : "text-rose-900";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${panelClass}`}>
      <p className={`font-semibold ${headingClass}`}>Connection test results</p>
      <dl className="mt-3 space-y-3 text-slate-800">
        <div>
          <dt className="font-medium text-slate-700">People Enrichment — POST /api/v1/people/match</dt>
          <dd className="mt-1 leading-snug">{enrichMessage}</dd>
          {process.env.NODE_ENV !== "production" && enrichDetail ? (
            <dd className="mt-1 break-words font-mono text-xs text-slate-600">{enrichDetail}</dd>
          ) : null}
        </div>
        <div>
          <dt className="font-medium text-slate-700">People Search — POST /api/v1/mixed_people/api_search</dt>
          <dd className={`mt-1 leading-snug ${s === "master" ? "text-amber-900" : ""}`}>{searchMessage}</dd>
          {process.env.NODE_ENV !== "production" && searchDetail ? (
            <dd className="mt-1 break-words font-mono text-xs text-slate-600">{searchDetail}</dd>
          ) : null}
        </div>
      </dl>
    </div>
  );
}

export default async function ExhibitorApolloPage({
  searchParams,
}: {
  searchParams?: Promise<{
    saved?: string;
    disabled?: string;
    edit?: string;
    error?: string;
    reason?: string;
    test?: string;
    enrich?: string;
    search?: string;
    enrich_detail?: string;
    search_detail?: string;
  }>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const accountId = sessionUser.company_id;
  const resolvedSearchParams = (await searchParams) ?? {};

  if (!accountId) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Apollo</h1>
            <p className="text-slate-600">Configure API access for lead enrichment and list building.</p>
          </div>
          <Link
            href="/exhibitor/integrations"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to Integrations
          </Link>
        </div>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Your exhibitor admin user is not linked to an account, so this integration cannot be saved.
        </p>
      </section>
    );
  }

  const supabase = createAdminClient();
  const { data, error: lookupError } = await (supabase as any)
    .from("integrations")
    .select("access_token, updated_at, provider_account_id")
    .eq("account_id", accountId)
    .eq("provider", "apollo")
    .maybeSingle();

  const integration = (data as ApolloIntegrationRow | null) ?? null;
  const apiKeyStored = String(integration?.access_token ?? "").trim();
  const isConnected = Boolean(apiKeyStored);
  const isEditMode = resolvedSearchParams.edit === "1" || !isConnected;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Apollo</h1>
          <p className="text-slate-600">
            Add your Apollo API key (sent as <span className="font-mono text-xs">X-Api-Key</span>). People Match powers lead
            enrichment; People Search powers net-new list building (search results do not include email or phone).
          </p>
        </div>
        <Link
          href="/exhibitor/integrations"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to Integrations
        </Link>
      </div>

      <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${
              isConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-600" : "bg-slate-500"}`} />
            {isConnected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          {isConnected
            ? "Your API key is stored for this account. Run a connection test, replace the key, or disconnect below."
            : "Paste your API key from Apollo to connect."}
        </p>

        {lookupError ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {lookupError.message ?? "Failed to load integration status."}
          </p>
        ) : null}

        {isEditMode ? (
          <form method="post" action="/api/exhibitor/integrations/apollo/setup" className="mt-6 space-y-4">
            <div>
              <label htmlFor="apollo-api-key" className="block text-sm font-semibold text-slate-800">
                API key
              </label>
              <input
                id="apollo-api-key"
                name="apiKey"
                type="password"
                autoComplete="off"
                required={!isConnected}
                placeholder={isConnected ? "Enter a new key to replace the stored key" : "Secret key"}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
              >
                {isConnected ? "Update API key" : "Save API key"}
              </button>
              {isConnected ? (
                <Link
                  href="/exhibitor/integrations/apollo"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </Link>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">Key last updated: {formatTimestamp(integration?.updated_at ?? null)}</p>
          </form>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stored API key</p>
              <p className="mt-2 font-mono text-sm font-semibold text-slate-900">{maskApiKey(apiKeyStored)}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <form method="post" action="/api/exhibitor/integrations/apollo/test">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Test connection
                </button>
              </form>
              <Link
                href="/exhibitor/integrations/apollo?edit=1"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Replace API key
              </Link>
              <form method="post" action="/api/exhibitor/integrations/apollo/disable">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Disconnect
                </button>
              </form>
            </div>
            <p className="text-xs text-slate-500">Key last updated: {formatTimestamp(integration?.updated_at ?? null)}</p>
          </div>
        )}
      </article>

      {resolvedSearchParams.saved === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Apollo configuration saved.
        </p>
      ) : null}
      {resolvedSearchParams.disabled === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Apollo disconnected.
        </p>
      ) : null}
      {resolvedSearchParams.test === "1" ? (
        <ApolloConnectionTestBanner
          enrich={resolvedSearchParams.enrich}
          search={resolvedSearchParams.search}
          enrichDetail={resolvedSearchParams.enrich_detail}
          searchDetail={resolvedSearchParams.search_detail}
        />
      ) : null}
      {resolvedSearchParams.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {resolvedSearchParams.error === "missing_api_key"
            ? "Save an API key before testing the connection."
            : resolvedSearchParams.error === "missing_account"
              ? "Your account context is missing."
              : resolvedSearchParams.error === "save_failed"
                ? `Failed to save Apollo setup.${
                    process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                      ? ` Reason: ${resolvedSearchParams.reason}`
                      : ""
                  }`
                : resolvedSearchParams.error === "disable_failed"
                  ? `Failed to disconnect Apollo.${
                      process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                        ? ` Reason: ${resolvedSearchParams.reason}`
                        : ""
                    }`
                  : resolvedSearchParams.error === "test_failed"
                    ? `Could not update connection status.${
                        process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                          ? ` Reason: ${resolvedSearchParams.reason}`
                          : ""
                      }`
                    : "Request failed."}
        </p>
      ) : null}
    </section>
  );
}
