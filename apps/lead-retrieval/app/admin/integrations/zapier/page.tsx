import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-ui";

type ZapierConfigRow = {
  id: string;
  zapier_webhook_url: string | null;
  zapier_payload_type: string | null;
  zapier_trigger_events: string[] | null;
  zapier_payload_fields: string[] | null;
  updated_at: string | null;
};

const TRIGGER_EVENT_OPTIONS = [
  { value: "lead_created", label: "Lead Created" },
  { value: "lead_updated", label: "Lead Updated" },
  { value: "lead_scored", label: "Lead Scored" },
  { value: "conversation_completed", label: "Conversation Completed" }
] as const;
const PAYLOAD_FIELD_OPTIONS = [
  { value: "full_name", label: "full_name" },
  { value: "job_title", label: "job_title" },
  { value: "company_text", label: "company_text" },
  { value: "email", label: "email" },
  { value: "phone", label: "phone" },
  { value: "rating", label: "rating" },
  { value: "priority_score", label: "priority_score" },
  { value: "follow_up_date", label: "follow_up_date" },
  { value: "notes", label: "notes" },
  { value: "ai_summary", label: "ai_summary" },
  { value: "transcript", label: "transcript" },
  { value: "event_name", label: "event_name" },
  { value: "owner_name", label: "owner_name" }
] as const;
const DEFAULT_PAYLOAD_FIELDS = PAYLOAD_FIELD_OPTIONS.map((option) => option.value);

function toLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

export default async function ZapierIntegrationPage({
  searchParams
}: {
  searchParams?: Promise<{
    saved?: string;
    tested?: string;
    edit?: string;
    error?: string;
    reason?: string;
  }>;
}) {
  const sessionUser = await requireAuth();

  if (sessionUser.role !== "platform_admin" && sessionUser.role !== "exhibitor_admin") {
    redirect("/app");
  }

  if (!sessionUser.company_id) {
    return (
      <section className="space-y-6">
        <AdminPageHeader
          title="Zapier"
          subtitle="Configure Zapier webhook automation for your account."
          action={
            <Link
              href="/admin/integrations"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Integrations
            </Link>
          }
        />
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          Your admin user is not linked to an account, so Zapier setup cannot be saved.
        </p>
      </section>
    );
  }

  const supabase = createAdminClient();
  const { data: configData } = await (supabase as any)
    .from("companies")
    .select("id, zapier_webhook_url, zapier_payload_type, zapier_trigger_events, zapier_payload_fields, updated_at")
    .eq("id", sessionUser.company_id)
    .maybeSingle();

  const config = (configData as ZapierConfigRow | null) ?? null;
  const webhookUrl = String(config?.zapier_webhook_url ?? "").trim();
  const isConnected = Boolean(webhookUrl);
  const resolvedSearchParams = (await searchParams) ?? {};
  const savedTriggerEvents = Array.isArray(config?.zapier_trigger_events)
    ? config.zapier_trigger_events.filter(Boolean)
    : [];
  const selectedTriggerEvents = savedTriggerEvents.length
    ? savedTriggerEvents
    : [String(config?.zapier_payload_type ?? "").trim() || "lead_created"];
  const selectedPayloadFields = Array.isArray(config?.zapier_payload_fields) && config.zapier_payload_fields.length
    ? config.zapier_payload_fields.filter(Boolean)
    : DEFAULT_PAYLOAD_FIELDS;
  const isConfigured = isConnected && selectedTriggerEvents.length > 0 && selectedPayloadFields.length > 0;
  const showSetupForm = resolvedSearchParams.edit === "1" || !isConfigured || Boolean(resolvedSearchParams.error);

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Zapier"
        subtitle="Configure Zapier webhook automation for your account."
        action={
          <Link
            href="/admin/integrations"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to Integrations
          </Link>
        }
      />

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Connection status</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isConnected
                ? "Zapier webhook is configured for this account."
                : "No Zapier webhook configured yet."}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
              isConnected ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
            }`}
          >
            {isConnected ? "Connected" : "Not Connected"}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">Zapier</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account ID</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{sessionUser.company_id}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Webhook URL</dt>
            <dd className="mt-1 break-all text-sm font-semibold text-slate-900">{webhookUrl || "N/A"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Updated At</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{formatTimestamp(config?.updated_at ?? null)}</dd>
          </div>
        </dl>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">Zapier configuration</h3>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              isConfigured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {isConfigured ? "Configured" : "Setup Required"}
          </span>
        </div>

        {showSetupForm ? (
          <form method="post" action="/api/admin/integrations/zapier/setup" className="mt-5 space-y-6">
            <div className="space-y-2">
              <label htmlFor="webhookUrl" className="text-sm font-semibold text-slate-800">
                Webhook URL
              </label>
              <input
                id="webhookUrl"
                name="webhookUrl"
                type="url"
                defaultValue={webhookUrl}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800">Trigger events</legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {TRIGGER_EVENT_OPTIONS.map((option) => {
                  const checked = selectedTriggerEvents.includes(option.value);
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

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-800">Payload Configuration</legend>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {PAYLOAD_FIELD_OPTIONS.map((option) => {
                  const checked = selectedPayloadFields.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                    >
                      <input
                        type="checkbox"
                        name="payloadFields"
                        value={option.value}
                        defaultChecked={checked}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      {toLabel(option.label)}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
              >
                Save
              </button>
            </div>

            <p className="text-xs text-slate-500">Config last updated: {formatTimestamp(config?.updated_at ?? null)}</p>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configured Trigger Events</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedTriggerEvents.map((event) => (
                  <span
                    key={event}
                    className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                  >
                    {toLabel(event)}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configured Payload Fields</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedPayloadFields.map((field) => (
                  <span
                    key={field}
                    className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
                  >
                    {toLabel(field)}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/integrations/zapier?edit=1"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Edit Configuration
              </Link>
              <form method="post" action="/api/admin/integrations/zapier/test">
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  Send Test Payload
                </button>
              </form>
            </div>
          </div>
        )}
      </article>

      {resolvedSearchParams.saved === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Zapier configuration saved.
        </p>
      ) : null}
      {resolvedSearchParams.tested === "1" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Test payload sent to Zapier.
        </p>
      ) : null}
      {resolvedSearchParams.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {resolvedSearchParams.error === "missing_account"
            ? "Your account context is missing."
            : resolvedSearchParams.error === "invalid_webhook_url"
                ? "Please provide a valid webhook URL."
                : resolvedSearchParams.error === "invalid_trigger_events"
                  ? "Select at least one valid trigger event."
                  : resolvedSearchParams.error === "invalid_payload_fields"
                    ? "Select at least one valid payload field."
                : resolvedSearchParams.error === "missing_webhook"
                  ? "Set and save a webhook URL before sending a test payload."
                  : resolvedSearchParams.error === "save_failed"
                    ? `Failed to save Zapier setup.${
                        process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                          ? ` Reason: ${resolvedSearchParams.reason}`
                          : ""
                      }`
                    : resolvedSearchParams.error === "test_failed"
                      ? `Failed to send test payload.${
                          process.env.NODE_ENV !== "production" && resolvedSearchParams.reason
                            ? ` Reason: ${resolvedSearchParams.reason}`
                            : ""
                        }`
                      : "Zapier setup request failed."}
        </p>
      ) : null}
    </section>
  );
}
