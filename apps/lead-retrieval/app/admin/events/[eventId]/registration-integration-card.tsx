"use client";

import { useActionState, useState } from "react";

type RegistrationProvider = "none" | "streampoint";

type RegistrationIntegrationCardProps = {
  eventId: string;
  initialProvider: string | null;
  initialBaseUrl: string | null;
  initialApiToken: string | null;
  initialRegistrationEventId: string | null;
  action: (_previousState: string | null, formData: FormData) => Promise<string | null>;
};

export function RegistrationIntegrationCard({
  eventId,
  initialProvider,
  initialBaseUrl,
  initialApiToken,
  initialRegistrationEventId,
  action
}: RegistrationIntegrationCardProps) {
  const startingProvider: RegistrationProvider =
    initialProvider === "streampoint" ? "streampoint" : "none";

  const [provider, setProvider] = useState<RegistrationProvider>(startingProvider);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? "");
  const [apiToken, setApiToken] = useState(initialApiToken ?? "");
  const [registrationEventId, setRegistrationEventId] = useState(
    initialRegistrationEventId ?? ""
  );
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [saveMessage, saveAction, isSaving] = useActionState(action, null);

  const canTest = provider === "streampoint" && baseUrl.trim() && apiToken.trim();

  async function handleTestConnection() {
    if (!canTest || testStatus === "loading") {
      return;
    }

    setTestStatus("loading");
    setTestMessage(null);
    try {
      const response = await fetch("/api/admin/integrations/streampoint/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          token: apiToken.trim()
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setTestStatus("error");
        setTestMessage(payload.error ?? "Connection test failed.");
        return;
      }

      setTestStatus("success");
      setTestMessage(payload.message ?? "Connection successful.");
    } catch (error) {
      setTestStatus("error");
      setTestMessage(error instanceof Error ? error.message : "Connection test failed.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
      <h2 className="text-2xl font-semibold text-slate-950 md:text-3xl">Registration Integration</h2>
      <p className="mt-2 text-sm text-slate-600">
        Configure event-level registration provider settings for this event.
      </p>

      <form action={saveAction} className="mt-6 space-y-5">
        <input type="hidden" name="eventId" value={eventId} />

        <label className="block space-y-2.5">
          <span className="text-sm font-semibold text-slate-700">Provider</span>
          <select
            name="registrationProvider"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as RegistrationProvider);
              setTestMessage(null);
              setTestStatus("idle");
            }}
            className="h-12 w-full rounded-xl border border-border px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="none">None</option>
            <option value="streampoint">Streampoint (SPS)</option>
          </select>
        </label>

        {provider === "streampoint" ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Base URL</span>
              <input
                name="registrationBaseUrl"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.spsleads.com"
                className="h-12 w-full rounded-xl border border-border px-3.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">API Token (x-auth-token)</span>
              <input
                type="password"
                name="registrationApiToken"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="Enter Streampoint API token"
                className="h-12 w-full rounded-xl border border-border px-3.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-700">Streampoint Event ID</span>
              <input
                name="registrationEventId"
                value={registrationEventId}
                onChange={(event) => setRegistrationEventId(event.target.value)}
                placeholder="Event identifier used by Streampoint APIs"
                className="h-12 w-full rounded-xl border border-border px-3.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <p className="text-xs text-slate-500">
                Event identifier used by Streampoint APIs.
              </p>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!canTest || testStatus === "loading"}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-indigo-200 px-4 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testStatus === "loading" ? "Testing..." : "Test Connection"}
              </button>
              {testMessage ? (
                <p
                  className={`text-sm font-medium ${
                    testStatus === "success" ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {testMessage}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <input type="hidden" name="registrationBaseUrl" value="" />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? "Saving..." : "Save Integration"}
          </button>
          {saveMessage ? (
            <p
              className={`text-sm font-medium ${
                saveMessage.toLowerCase().includes("saved")
                  ? "text-emerald-700"
                  : "text-rose-700"
              }`}
            >
              {saveMessage}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
