"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ZoomInfoEnrichmentDomains, ZoomInfoPublicStatus } from "@/lib/integrations/zoominfo/oauth-core";
import { ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS } from "@/lib/integrations/zoominfo/enrichment-domain-settings";

const ZOOMINFO_SETTINGS_PATH = "/exhibitor/integrations/zoominfo";

const cardClass = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function statusPill(pub: ZoomInfoPublicStatus): { label: string; className: string } {
  if (pub.connected) {
    return { label: "Connected", className: "bg-emerald-100 text-emerald-800" };
  }
  if (pub.invalidToken) {
    return { label: "Invalid token", className: "bg-rose-100 text-rose-800" };
  }
  if (pub.tokenSaved) {
    return { label: "Not connected", className: "bg-slate-100 text-slate-700" };
  }
  return { label: "Not connected", className: "bg-slate-100 text-slate-700" };
}

export function ZoomInfoSettingsClient({
  initialPublic,
  lastUpdatedLabel,
}: {
  initialPublic: ZoomInfoPublicStatus;
  lastUpdatedLabel: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!initialPublic.tokenSaved);
  const [bearerToken, setBearerToken] = useState("");
  const [connectionLabel, setConnectionLabel] = useState(initialPublic.connectionLabel ?? "");
  const [saveBusy, setSaveBusy] = useState(false);
  const [validateBusy, setValidateBusy] = useState(false);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [enrichmentDomains, setEnrichmentDomains] = useState<ZoomInfoEnrichmentDomains>(
    () => ({ ...initialPublic.enrichmentDomains })
  );
  const [enrichmentSaveBusy, setEnrichmentSaveBusy] = useState(false);
  const [enrichmentSaveMessage, setEnrichmentSaveMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setConnectionLabel(initialPublic.connectionLabel ?? "");
  }, [initialPublic.connectionLabel]);

  useEffect(() => {
    setEnrichmentDomains({ ...initialPublic.enrichmentDomains });
  }, [initialPublic.enrichmentDomains]);

  useEffect(() => {
    if (initialPublic.tokenSaved) {
      setEditing(false);
    }
  }, [initialPublic.tokenSaved]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setActionError(null);
    setSaveBusy(true);
    try {
      const res = await fetch("/api/exhibitor/integrations/zoominfo/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bearerToken: bearerToken.trim() ? bearerToken.trim() : null,
          connectionLabel: connectionLabel.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setSaveError(body?.error ?? "Could not save token. Check the value and try again.");
        return;
      }
      setBearerToken("");
      setEditing(false);
      router.replace(`${ZOOMINFO_SETTINGS_PATH}?token_saved=1`);
      router.refresh();
    } finally {
      setSaveBusy(false);
    }
  }

  async function onValidate() {
    setActionError(null);
    setValidateBusy(true);
    try {
      const res = await fetch("/api/exhibitor/integrations/zoominfo/validate", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as { error?: string; ok?: boolean } | null;
      if (!res.ok) {
        setActionError(body?.error ?? "Validation failed.");
        router.refresh();
        return;
      }
      router.refresh();
    } finally {
      setValidateBusy(false);
    }
  }

  async function onSaveEnrichmentDomains() {
    setEnrichmentSaveMessage(null);
    setEnrichmentSaveBusy(true);
    try {
      const res = await fetch("/api/exhibitor/integrations/zoominfo/enrichment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(enrichmentDomains),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; enrichmentDomains?: ZoomInfoEnrichmentDomains }
        | null;
      if (!res.ok) {
        setEnrichmentSaveMessage({
          kind: "error",
          text: body?.error ?? "Could not save enrichment settings.",
        });
        return;
      }
      if (body?.enrichmentDomains) {
        setEnrichmentDomains({ ...body.enrichmentDomains });
      }
      setEnrichmentSaveMessage({ kind: "success", text: "Enrichment data settings saved." });
      router.refresh();
    } finally {
      setEnrichmentSaveBusy(false);
    }
  }

  async function onDisconnect() {
    setActionError(null);
    setDisconnectBusy(true);
    try {
      const res = await fetch("/api/exhibitor/integrations/zoominfo", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setActionError(body?.error ?? "Could not disconnect.");
        return;
      }
      setEditing(true);
      setBearerToken("");
      router.replace(ZOOMINFO_SETTINGS_PATH);
      router.refresh();
    } finally {
      setDisconnectBusy(false);
    }
  }

  const pill = statusPill(initialPublic);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className={`${labelClass} mb-2`}>Token</h2>
        <p className="mb-3 text-xs leading-snug text-slate-600">
          Paste your ZoomInfo API bearer token (JWT). SignalThread uses it for lead enrichment and pre-show intelligence
          over the ZoomInfo GTM API. The full token is stored server-side only and is never returned to the browser after
          save.
        </p>

        {saveError ? (
          <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">{saveError}</div>
        ) : null}

        {initialPublic.tokenSaved && !editing ? (
          <div className="space-y-3">
            <div>
              <p className={labelClass}>Saved token</p>
              <p className="mt-1 font-mono text-sm text-slate-900">{initialPublic.tokenMasked ?? "••••••••"}</p>
            </div>
            {initialPublic.connectionLabel ? (
              <div>
                <p className={labelClass}>Label</p>
                <p className="mt-1 text-sm text-slate-800">{initialPublic.connectionLabel}</p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setEditing(true);
                setBearerToken("");
              }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Edit token
            </button>
          </div>
        ) : (
          <form onSubmit={onSave} className="space-y-3">
            <label className="block">
              <span className={labelClass}>Bearer token</span>
              <input
                name="zoominfoBearerToken"
                type="password"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={bearerToken}
                onChange={(ev) => setBearerToken(ev.target.value)}
                placeholder={initialPublic.tokenSaved ? "Leave blank to keep existing token" : "Paste bearer token"}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Label (optional)</span>
              <input
                name="zoominfoLabel"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={connectionLabel}
                onChange={(ev) => setConnectionLabel(ev.target.value)}
                placeholder="e.g. Production ZoomInfo key"
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saveBusy}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-60"
              >
                {saveBusy ? "Saving…" : "Save token"}
              </button>
              {initialPublic.tokenSaved ? (
                <button
                  type="button"
                  onClick={() => {
                    setSaveError(null);
                    setEditing(false);
                    setBearerToken("");
                    setConnectionLabel(initialPublic.connectionLabel ?? "");
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>

      <div className={cardClass}>
        <h2 className={`${labelClass} mb-3`}>Connection</h2>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ${pill.className}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {pill.label}
          </span>
        </div>

        {lastUpdatedLabel ? <p className="mb-3 text-xs text-slate-500">Last updated {lastUpdatedLabel}</p> : null}

        {actionError ? (
          <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900">{actionError}</div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {initialPublic.tokenSaved ? (
            <button
              type="button"
              disabled={validateBusy}
              onClick={() => void onValidate()}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {validateBusy ? "Validating…" : "Validate connection"}
            </button>
          ) : null}

          {initialPublic.tokenSaved ? (
            <button
              type="button"
              disabled={disconnectBusy}
              onClick={() => void onDisconnect()}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-white px-4 text-sm font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-60"
            >
              {disconnectBusy ? "Removing…" : "Disconnect"}
            </button>
          ) : null}
        </div>

        {!initialPublic.tokenSaved ? (
          <p className="mt-2 text-xs text-slate-500">Save a token above to enable validation.</p>
        ) : null}
      </div>

      <div className={cardClass}>
        <h2 className={`${labelClass} mb-1`}>Enrichment Data Settings</h2>
        <p className="mb-3 text-xs leading-snug text-slate-600">
          Choose which ZoomInfo data categories SignalThread may use for enrichment and pre-show intelligence. This is an
          app-side preference only and does not change your ZoomInfo developer portal scopes.
        </p>

        {!initialPublic.tokenSaved ? (
          <p className="text-xs text-slate-500">Save a ZoomInfo token above to configure these options.</p>
        ) : (
          <>
            <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-slate-50/50">
              {ZOOMINFO_ENRICHMENT_DOMAIN_OPTIONS.map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{row.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{row.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enrichmentDomains[row.id]}
                    onClick={() =>
                      setEnrichmentDomains((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                    }
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                      enrichmentDomains[row.id]
                        ? "border-indigo-600 bg-indigo-600"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 translate-y-px rounded-full bg-white shadow transition ${
                        enrichmentDomains[row.id] ? "translate-x-[18px]" : "translate-x-px"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={enrichmentSaveBusy}
                onClick={() => void onSaveEnrichmentDomains()}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {enrichmentSaveBusy ? "Saving…" : "Save enrichment settings"}
              </button>
            </div>

            {enrichmentSaveMessage ? (
              <div
                className={`mt-2 rounded-md border px-2.5 py-2 text-xs ${
                  enrichmentSaveMessage.kind === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-rose-200 bg-rose-50 text-rose-900"
                }`}
              >
                {enrichmentSaveMessage.text}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
