"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { INTEGRATION_TABS, type IntegrationCategory, type IntegrationTab, type IntegrationCatalogItem } from "@/lib/config/integration-catalog";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { DefaultSenderControl } from "@/components/exhibitor/email-provider-preference";
import type { EmailProvider } from "@/lib/integrations/email/types";

type IntegrationCard = Omit<IntegrationCatalogItem, "manageRoute"> & {
  status: "connected" | "not_connected" | "error";
  resolvedConnectHref: string | null;
  manageRoute: string | null;
  configured: boolean;
  enrichmentDefault?: {
    isDefault: boolean;
    canSetDefault: boolean;
    provider: string;
  };
  overviewMeta?: {
    lastUpdatedLabel: string | null;
    accountLabel?: string | null;
    canDisconnect?: boolean;
  };
};

export function IntegrationsCatalogClient({
  integrations,
  initialEmailProviderPreference,
  showDefaultSenderControls,
}: {
  integrations: IntegrationCard[];
  initialEmailProviderPreference: EmailProvider | null;
  showDefaultSenderControls: boolean;
}) {
  const [activeTab, setActiveTab] = useState<IntegrationTab>("All Integrations");
  const [emailProviderPreference, setEmailProviderPreference] = useState<EmailProvider | null>(
    initialEmailProviderPreference,
  );
  const [preferencePending, setPreferencePending] = useState<EmailProvider | null>(null);
  const [preferenceError, setPreferenceError] = useState<EmailProvider | null>(null);

  async function setDefaultEmailSender(provider: EmailProvider) {
    if (preferencePending) return;
    setPreferencePending(provider);
    setPreferenceError(null);
    try {
      const response = await fetch("/api/exhibitor/integrations/email-provider-preference", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!response.ok) throw new Error("save_failed");
      setEmailProviderPreference(provider);
    } catch {
      setPreferenceError(provider);
    } finally {
      setPreferencePending(null);
    }
  }

  const filtered = useMemo(() => {
    if (activeTab === "All Integrations") {
      return integrations;
    }
    return integrations.filter((integration) => integration.category === activeTab);
  }, [activeTab, integrations]);

  const groupedForAll = useMemo(() => {
    if (activeTab !== "All Integrations") {
      return [] as Array<{ category: IntegrationCategory; items: IntegrationCard[] }>;
    }

    const categories = INTEGRATION_TABS.filter(
      (tab): tab is IntegrationCategory => tab !== "All Integrations",
    );

    return categories
      .map((category) => ({
        category,
        items: integrations.filter((integration) => integration.category === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [activeTab, integrations]);

  return (
    <PageShell>
      <PageHeader
        title="Integrations"
        subtitle="Connect your CRM and marketing tools."
      />

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pb-2">
          {INTEGRATION_TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative pb-3 text-lg font-bold transition ${
                  isActive ? "text-violet-600" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab}
                <span
                  className={`absolute inset-x-0 -bottom-[9px] h-[3px] rounded-full bg-violet-500 transition ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "All Integrations" ? (
        <div className="space-y-10">
          {groupedForAll.map((group) => (
            <section key={group.category} className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">{group.category}</h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {group.items.map((integration) => (
                  <IntegrationCardView
                    key={integration.id}
                    integration={integration}
                    emailProviderPreference={emailProviderPreference}
                    showDefaultSenderControls={showDefaultSenderControls}
                    preferencePending={preferencePending}
                    preferenceError={preferenceError}
                    onSetDefaultEmailSender={setDefaultEmailSender}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filtered.map((integration) => (
            <IntegrationCardView
              key={integration.id}
              integration={integration}
              emailProviderPreference={emailProviderPreference}
              showDefaultSenderControls={showDefaultSenderControls}
              preferencePending={preferencePending}
              preferenceError={preferenceError}
              onSetDefaultEmailSender={setDefaultEmailSender}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function IntegrationCardView({
  integration,
  emailProviderPreference,
  showDefaultSenderControls,
  preferencePending,
  preferenceError,
  onSetDefaultEmailSender,
}: {
  integration: IntegrationCard;
  emailProviderPreference: EmailProvider | null;
  showDefaultSenderControls: boolean;
  preferencePending: EmailProvider | null;
  preferenceError: EmailProvider | null;
  onSetDefaultEmailSender: (provider: EmailProvider) => void;
}) {
  const isConnected = integration.status === "connected";
  const isError = integration.status === "error";
  const hasIntegrationAccess = isConnected || isError;
  const isComingSoon = !hasIntegrationAccess && !integration.implemented;
  const isSalesforceSetup = integration.provider === "salesforce" && isConnected && !integration.configured;
  const ctaHref = hasIntegrationAccess
    ? integration.manageRoute ?? integration.resolvedConnectHref
    : integration.resolvedConnectHref;
  const ctaLabel = hasIntegrationAccess
    ? isSalesforceSetup
      ? "Set Up Salesforce"
      : integration.manageLabel ?? `Manage ${integration.name}`
    : isComingSoon
      ? "Coming Soon"
      : integration.connectLabel ?? `Connect ${integration.name}`;
  const shouldUseDocumentNavigation = Boolean(
    ctaHref &&
      (ctaHref.startsWith("/api/") ||
        ctaHref.startsWith("http://") ||
        ctaHref.startsWith("https://"))
  );
  const showPipedriveDisconnect =
    integration.provider === "pipedrive" && Boolean(integration.overviewMeta?.canDisconnect);
  const showPipedriveConfigure = integration.provider === "pipedrive" && isConnected && Boolean(integration.manageRoute);
  const emailProvider =
    integration.provider === "google_workspace" || integration.provider === "microsoft_365"
      ? integration.provider
      : null;
  const showDefaultSender = Boolean(showDefaultSenderControls && emailProvider);

  return (
    <article className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
            <Image
              src={integration.logoSrc}
              alt={`${integration.name} logo`}
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">{integration.name}</h3>
            <p className="text-base leading-snug text-slate-600">{integration.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${
              isConnected
                ? "bg-emerald-100 text-emerald-700"
                : isError
                  ? "bg-rose-100 text-rose-700"
                  : isComingSoon
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-700"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? "bg-emerald-600" : isError ? "bg-rose-600" : isComingSoon ? "bg-amber-600" : "bg-slate-500"
              }`}
            />
            {isConnected ? "Connected" : isError ? "Error" : isComingSoon ? "Coming Soon" : "Not Connected"}
          </span>
          {integration.enrichmentDefault?.isDefault ? (
            <span className="inline-flex items-center gap-2 rounded-2xl bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-800">
              Default enrichment
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-100 px-5 py-4">
        <p className="text-base font-medium leading-snug text-slate-600">{integration.helperText}</p>
      </div>

      <div className="mt-auto space-y-4 pt-6">
        {integration.overviewMeta?.lastUpdatedLabel ? (
          <p className="text-sm text-slate-500">Last updated {integration.overviewMeta.lastUpdatedLabel}</p>
        ) : null}
        {integration.overviewMeta?.accountLabel ? (
          <p className="text-sm font-medium text-slate-600">
            Account: {integration.overviewMeta.accountLabel}
          </p>
        ) : null}
        {showDefaultSender && emailProvider ? (
          <DefaultSenderControl
            provider={emailProvider}
            selected={emailProviderPreference === emailProvider}
            pending={preferencePending === emailProvider}
            onSelect={onSetDefaultEmailSender}
            error={preferenceError === emailProvider ? "Could not save default sender. Try again." : null}
          />
        ) : null}

        <div className="space-y-3">
          {showPipedriveConfigure && integration.manageRoute ? (
            <Link
              href={integration.manageRoute}
              className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-lg font-semibold text-white shadow-[0_10px_22px_rgba(99,102,241,0.28)] transition hover:from-indigo-600 hover:to-violet-700"
            >
              Configure
            </Link>
          ) : ctaHref && !isComingSoon && shouldUseDocumentNavigation ? (
            <a
              href={ctaHref}
              className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-lg font-semibold text-white shadow-[0_10px_22px_rgba(99,102,241,0.28)] transition hover:from-indigo-600 hover:to-violet-700"
            >
              {ctaLabel}
            </a>
          ) : ctaHref && !isComingSoon ? (
            <Link
              href={ctaHref}
              className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-lg font-semibold text-white shadow-[0_10px_22px_rgba(99,102,241,0.28)] transition hover:from-indigo-600 hover:to-violet-700"
            >
              {ctaLabel}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex h-14 w-full cursor-not-allowed items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500/60 to-violet-600/60 px-5 text-lg font-semibold text-white"
            >
              {ctaLabel}
            </button>
          )}

          {showPipedriveDisconnect && isConnected && integration.disconnectRoute ? (
            <form method="post" action={integration.disconnectRoute}>
              <DisconnectButton />
            </form>
          ) : null}

          {showPipedriveDisconnect && !isConnected && integration.disconnectRoute ? (
            <form method="post" action={integration.disconnectRoute}>
              <DisconnectButton />
            </form>
          ) : null}
        </div>

        {integration.enrichmentDefault?.canSetDefault && !integration.enrichmentDefault.isDefault && !isError ? (
          <form method="post" action="/api/exhibitor/integrations/enrichment/default">
            <input type="hidden" name="provider" value={integration.enrichmentDefault.provider} />
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-800 transition hover:bg-violet-100"
            >
              Set as default enrichment provider
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function DisconnectButton({ primary = false }: { primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-14 w-full items-center justify-center rounded-2xl px-5 text-lg font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
        primary
          ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-[0_10px_22px_rgba(99,102,241,0.28)] hover:from-indigo-600 hover:to-violet-700"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
