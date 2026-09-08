import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { StreampointTestLookupPanel } from "@/components/admin/streampoint-test-lookup";

type StreampointConfigRow = {
  id: string;
  account_id: string;
  provider: "streampoint";
  api_base_url: string | null;
  api_token: string | null;
  environment: "staging" | "production" | null;
  is_enabled: boolean;
  updated_at: string | null;
};

type EventOptionRow = {
  id: string;
  name: string;
  company_id: string | null;
};

const STREAMPPOINT_BASE_URL_BY_ENV = {
  staging: "https://apireststaging.streampoint.com/v1/personal.svc",
  production: "https://apirest.streampoint.com/v1/personal.svc"
} as const;

function inferEnvironmentFromBaseUrl(baseUrl: string | null | undefined): "staging" | "production" {
  const normalized = String(baseUrl ?? "").toLowerCase();
  return normalized.includes("apirest.streampoint.com") ? "production" : "staging";
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
    minute: "2-digit"
  });
}

function maskToken(value: string | null | undefined) {
  const token = String(value ?? "").trim();
  if (!token) return "Not set";
  if (token.length <= 8) return "••••••";
  return `${token.slice(0, 3)}••••••${token.slice(-3)}`;
}

function buildScopedHref(
  selectedEventId: string,
  params?: Record<string, string | undefined>
) {
  const search = new URLSearchParams();
  if (selectedEventId) {
    search.set("eventId", selectedEventId);
  }

  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });

  const query = search.toString();
  return query ? `/admin/integrations/streampoint?${query}` : "/admin/integrations/streampoint";
}

export default async function AdminStreampointIntegrationPage({
  searchParams
}: {
  searchParams?: Promise<{
    saved?: string;
    edit?: string;
    test?: string;
    error?: string;
    reason?: string;
    eventId?: string;
  }>;
}) {
  const sessionUser = await requireAuth();

  if (sessionUser.role !== "platform_admin") {
    redirect("/app");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const supabase = createAdminClient();
  const requestedEventId = String(resolvedSearchParams.eventId ?? "").trim();

  const { data: eventsData } = await (supabase as any)
    .from("events")
    .select("id, name, company_id")
    .order("created_at", { ascending: false });

  const eventOptions = (eventsData as EventOptionRow[] | null) ?? [];
  const selectedEventId = requestedEventId || eventOptions[0]?.id || "";
  const selectedEvent =
    (selectedEventId
      ? eventOptions.find((event) => event.id === selectedEventId) ?? null
      : null) ?? null;
  const scopedAccountId = sessionUser.company_id ?? selectedEvent?.company_id ?? null;

  let accountConfig: StreampointConfigRow | null = null;
  if (scopedAccountId) {
    const { data: configData } = await (supabase as any)
      .from("registration_provider_configs")
      .select("id, account_id, provider, api_base_url, api_token, environment, is_enabled, updated_at")
      .eq("account_id", scopedAccountId)
      .eq("provider", "streampoint")
      .maybeSingle();

    accountConfig = (configData as StreampointConfigRow | null) ?? null;
  }

  const selectedEnvironment: "staging" | "production" =
    accountConfig?.environment ?? inferEnvironmentFromBaseUrl(accountConfig?.api_base_url);
  const isEnabled = Boolean(accountConfig?.is_enabled);
  const baseUrlValue = STREAMPPOINT_BASE_URL_BY_ENV[selectedEnvironment];
  const apiTokenValue = accountConfig?.api_token ?? "";
  const isConfigured = Boolean(
    String(accountConfig?.api_base_url ?? "").trim() &&
      String(accountConfig?.api_token ?? "").trim() &&
      String(accountConfig?.environment ?? "").trim()
  );
  const lastUpdatedAt = accountConfig?.updated_at ?? null;
  const showSetupForm =
    !isConfigured || resolvedSearchParams.edit === "1" || Boolean(resolvedSearchParams.error);
  const showTestLookup = isConfigured && resolvedSearchParams.test === "1";

  const editHref = buildScopedHref(selectedEventId, { edit: "1" });
  const testHref = buildScopedHref(selectedEventId, { test: "1" });
  const closeTestHref = buildScopedHref(selectedEventId);

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Streampoint"
        subtitle="Manage Streampoint registration setup for SignalThread Lead Retrieval events."
        tag="Registration Provider"
      />

      <article className="rounded-2xl border border-border bg-card p-6 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#DFFF2D] to-[#D2F600] text-base font-bold text-[#101323] shadow-sm">
              SPS
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Streampoint</h2>
              <p className="mt-2 text-sm text-slate-600">
                Manage Streampoint registration setup for SignalThread Lead Retrieval events.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
              isConfigured
                ? isEnabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {isConfigured ? (isEnabled ? "Enabled" : "Disabled") : "Not Connected"}
          </span>
        </div>

        {showSetupForm ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                Setup Overview
              </h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  API token required
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Event-level provider mapping required
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Manual sync supported in v1
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Registrant and badge lookup supported in v1
                </li>
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                Provider Configuration
              </h3>
              <form method="post" action="/api/admin/integrations/streampoint/setup" className="mt-4 space-y-3">
                {!sessionUser.company_id ? (
                  <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                    <label htmlFor="streampointEventId" className="text-sm font-medium text-slate-900">
                      Event Scope
                    </label>
                    <select
                      id="streampointEventId"
                      name="eventId"
                      defaultValue={selectedEventId}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                    >
                      {eventOptions.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <label htmlFor="streampointEnvironment" className="text-sm font-medium text-slate-900">
                    Environment
                  </label>
                  <select
                    id="streampointEnvironment"
                    name="environment"
                    defaultValue={selectedEnvironment}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </select>
                </div>

                <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <label htmlFor="streampointApiToken" className="text-sm font-medium text-slate-900">
                    API Token (x-auth-token)
                  </label>
                  <input
                    id="streampointApiToken"
                    name="apiToken"
                    type="password"
                    defaultValue={apiTokenValue}
                    placeholder="Enter Streampoint API token"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <label htmlFor="streampointBaseUrl" className="text-sm font-medium text-slate-900">
                    Base URL
                  </label>
                  <input
                    id="streampointBaseUrl"
                    type="text"
                    readOnly
                    defaultValue={baseUrlValue}
                    placeholder="https://apireststaging.streampoint.com/v1/personal.svc"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <span className="text-sm font-medium text-slate-900">Default provider status</span>
                  <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      name="isEnabled"
                      type="checkbox"
                      defaultChecked={isEnabled}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Enabled
                  </span>
                </label>

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
                  disabled={!sessionUser.company_id && eventOptions.length === 0}
                >
                  Save
                </button>

                <p
                  className={`text-xs font-semibold ${
                    isConfigured ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {isConfigured ? "Setup Complete" : "Setup Required"}
                </p>
                <p className="text-xs text-slate-500">Config last updated: {formatTimestamp(lastUpdatedAt)}</p>
              </form>
            </section>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Setup Complete
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isEnabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {isEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">Last updated: {formatTimestamp(lastUpdatedAt)}</p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <SummaryItem
                  label="Event Scope"
                  value={sessionUser.company_id ? "Platform account" : selectedEvent?.name ?? "Event"}
                />
                <SummaryItem label="Environment" value={selectedEnvironment} />
                <SummaryItem label="Base URL" value={baseUrlValue} mono />
                <SummaryItem label="API Token" value={maskToken(apiTokenValue)} mono />
                <SummaryItem label="Provider status" value={isEnabled ? "Enabled" : "Disabled"} />
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={editHref}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Edit Configuration
              </Link>
              <Link
                href={testHref}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Test Lookup
              </Link>
              <Link
                href="/admin/events"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                View Event Setup
              </Link>
              <Link
                href="/admin/integrations"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Back to Integrations
              </Link>
            </div>

            {showTestLookup ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Streampoint Test Lookup</h3>
                  <Link href={closeTestHref} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                    Close
                  </Link>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Verify your current Streampoint configuration by confirmation ID.
                </p>
                <div className="mt-3">
                  <StreampointTestLookupPanel eventId={selectedEventId} />
                </div>
              </section>
            ) : null}

            <p className="text-xs text-slate-500">
              Event-level mapping remains configured in each event&apos;s Registration Integration section.
            </p>
          </div>
        )}
      </article>

      {resolvedSearchParams.saved === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Streampoint configuration saved.
        </p>
      ) : null}
      {resolvedSearchParams.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {resolvedSearchParams.error === "invalid_setup"
            ? "Enable requires a valid API Token."
            : resolvedSearchParams.error === "invalid_base_url"
              ? "Please provide a valid Base URL."
              : resolvedSearchParams.error === "invalid_environment"
                ? "Please select a valid Streampoint environment."
                : resolvedSearchParams.error === "missing_account"
                  ? "No account scope could be derived. Select an event with a linked account."
                  : resolvedSearchParams.error === "missing_event_scope"
                    ? "Select an event scope before saving."
                    : resolvedSearchParams.error === "save_failed"
                      ? `Failed to save Streampoint setup.${
                          process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                            ? ` Reason: ${resolvedSearchParams.reason}`
                            : ""
                        }`
                      : "Unable to save Streampoint setup."}
        </p>
      ) : null}
    </section>
  );
}

function SummaryItem({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-slate-900 ${mono ? "font-mono text-xs md:text-sm" : ""}`}>
        {value}
      </p>
    </div>
  );
}
