import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

type MakeIntegrationRow = {
  access_token: string | null;
  provider_account_id: string | null;
  refresh_token: string | null;
  scope: string[] | null;
  updated_at: string | null;
};

const TRIGGER_EVENT_OPTIONS = [
  { value: "lead_created", label: "Lead Created" },
  { value: "lead_updated", label: "Lead Updated" },
  { value: "lead_scored", label: "Lead Scored" },
  { value: "conversation_completed", label: "Conversation Completed" },
] as const;

const VALID_TRIGGER_EVENTS = new Set(TRIGGER_EVENT_OPTIONS.map((option) => option.value));

const PAYLOAD_TEMPLATE_OPTIONS = [
  {
    value: "lead_core",
    label: "Lead core profile",
    description: "Base lead fields only (name, title, company, contact, and score).",
  },
  {
    value: "lead_with_insights",
    label: "Lead core profile + AI insights",
    description: "Includes Lead core profile, plus AI summary and insight fields.",
  },
  {
    value: "conversation_snapshot",
    label: "Lead core profile + AI insights + Conversation snapshot",
    description: "Includes Lead core profile and AI insights, plus conversation snapshot fields.",
  },
] as const;

function toLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function maskWebhookUrl(value: string) {
  try {
    const parsed = new URL(value);
    const tail = parsed.pathname.split("/").filter(Boolean).slice(-2).join("/");
    const suffix = tail ? `/${tail}` : "";
    return `${parsed.origin}/...${suffix}`;
  } catch {
    return "••••••••";
  }
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

function parseTriggerEvents(scope: string[] | null | undefined) {
  if (!Array.isArray(scope)) return [] as string[];
  return scope.filter((value) => VALID_TRIGGER_EVENTS.has(String(value) as any));
}

function parseEnabled(refreshToken: string | null | undefined) {
  const normalized = String(refreshToken ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized !== "disabled";
}

export default async function ExhibitorMakeIntegrationPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; disabled?: string; edit?: string; error?: string; reason?: string }>;
}) {
  const sessionUser = await requireRole("exhibitor_admin");
  const accountId = sessionUser.company_id;

  if (!accountId) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Make.com Integration</h1>
            <p className="text-slate-600">Configure webhook delivery for Make.com automation scenarios.</p>
          </div>
          <Link
            href="/exhibitor/integrations"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to Integrations
          </Link>
        </div>

        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Your exhibitor admin user is not linked to an account, so Make.com setup cannot be saved.
        </p>
      </section>
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("integrations")
    .select("access_token, provider_account_id, refresh_token, scope, updated_at")
    .eq("account_id", accountId)
    .eq("provider", "make")
    .maybeSingle();

  const integration = (data as MakeIntegrationRow | null) ?? null;
  const lookupError = error?.message ?? null;
  const resolvedSearchParams = (await searchParams) ?? {};

  const webhookUrl = String(integration?.access_token ?? "").trim();
  const payloadTemplate = String(integration?.provider_account_id ?? "").trim();
  const triggerEvents = parseTriggerEvents(integration?.scope);
  const isEnabled = parseEnabled(integration?.refresh_token);

  const isConfigured = Boolean(webhookUrl) && Boolean(payloadTemplate);
  const showSetupForm = !isConfigured || resolvedSearchParams.edit === "1" || Boolean(resolvedSearchParams.error);

  const payloadTemplateLabel =
    PAYLOAD_TEMPLATE_OPTIONS.find((option) => option.value === payloadTemplate)?.label ?? payloadTemplate;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Make.com Integration</h1>
          <p className="text-slate-600">Configure outbound webhook payloads for your Make.com automations.</p>
        </div>
        <Link
          href="/exhibitor/integrations"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to Integrations
        </Link>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Connection status</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isConfigured
                ? isEnabled
                  ? "Make.com integration is configured and enabled."
                  : "Make.com integration is configured but currently disabled."
                : "Set up your Make.com webhook destination to enable this integration."}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
              isConfigured
                ? isEnabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
                : "bg-slate-200 text-slate-700"
            }`}
          >
            {isConfigured ? (isEnabled ? "Connected" : "Configured (Disabled)") : "Not Connected"}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">Make.com</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook destination</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">
              {webhookUrl ? maskWebhookUrl(webhookUrl) : "N/A"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payload mode</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{payloadTemplateLabel || "N/A"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated At</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(integration?.updated_at ?? null)}</dd>
          </div>
        </dl>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">Make.com setup</h3>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {isConfigured ? "Configured" : "Setup Required"}
          </span>
        </div>

        {showSetupForm ? (
          <form method="post" action="/api/exhibitor/integrations/make/setup" className="mt-5 space-y-6">
            <div className="space-y-2">
              <label htmlFor="webhookUrl" className="text-sm font-semibold text-slate-800">
                Webhook URL
              </label>
              <input
                id="webhookUrl"
                name="webhookUrl"
                type="url"
                required
                defaultValue={webhookUrl}
                placeholder="https://hook.make.com/..."
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800">Payload template</legend>
              <p className="text-xs text-slate-500">
                Choose how much data Make.com receives. Each option is cumulative from top to bottom.
              </p>
              <div className="space-y-3">
                {PAYLOAD_TEMPLATE_OPTIONS.map((option) => {
                  const checked = (payloadTemplate || "lead_core") === option.value;
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    >
                      <input
                        type="radio"
                        name="payloadTemplate"
                        value={option.value}
                        defaultChecked={checked}
                        className="mt-0.5 h-4 w-4 border-slate-300 text-indigo-600"
                      />
                      <span className="space-y-1">
                        <span className="block font-semibold text-slate-900">{option.label}</span>
                        <span className="block text-xs text-slate-600">{option.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800">Trigger events (optional)</legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {TRIGGER_EVENT_OPTIONS.map((option) => {
                  const checked = triggerEvents.length ? triggerEvents.includes(option.value) : option.value === "lead_created";
                  return (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="triggerEvents"
                        value={option.value}
                        defaultChecked={checked}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                name="isEnabled"
                defaultChecked={isEnabled || !isConfigured}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="space-y-1 text-sm text-slate-700">
                <span className="block font-semibold text-slate-900">Enable integration</span>
                <span className="block text-xs text-slate-600">
                  When enabled, SignalThread Lead Retrieval can send Make.com webhook payloads using your saved configuration.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
              >
                Save configuration
              </button>
            </div>

            <p className="text-xs text-slate-500">Config last updated: {formatTimestamp(integration?.updated_at ?? null)}</p>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Payload Template</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{payloadTemplateLabel || "N/A"}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configured Trigger Events</p>
              {triggerEvents.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {triggerEvents.map((event) => (
                    <span
                      key={event}
                      className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                    >
                      {toLabel(event)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No trigger events selected.</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/exhibitor/integrations/make?edit=1"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Edit configuration
              </Link>
              {isEnabled ? (
                <form method="post" action="/api/exhibitor/integrations/make/disable">
                  <button
                    type="submit"
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Disable integration
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        )}
      </article>

      {lookupError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {lookupError}
        </p>
      ) : null}
      {resolvedSearchParams.saved === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Make.com configuration saved.
        </p>
      ) : null}
      {resolvedSearchParams.disabled === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Make.com integration disabled.
        </p>
      ) : null}
      {resolvedSearchParams.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {resolvedSearchParams.error === "invalid_webhook_url"
            ? "Please provide a valid webhook URL."
            : resolvedSearchParams.error === "invalid_payload_template"
              ? "Please choose a valid payload template."
              : resolvedSearchParams.error === "invalid_trigger_events"
                ? "One or more selected trigger events are invalid."
                : resolvedSearchParams.error === "missing_account"
                  ? "Your account context is missing."
                  : resolvedSearchParams.error === "save_failed"
                    ? `Failed to save Make.com setup.${
                        process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                          ? ` Reason: ${resolvedSearchParams.reason}`
                          : ""
                      }`
                    : resolvedSearchParams.error === "disable_failed"
                      ? `Failed to disable Make.com integration.${
                          process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                            ? ` Reason: ${resolvedSearchParams.reason}`
                            : ""
                        }`
                      : "Make.com setup request failed."}
        </p>
      ) : null}
    </section>
  );
}
