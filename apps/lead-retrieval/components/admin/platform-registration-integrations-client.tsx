"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  PLATFORM_INTEGRATION_TABS,
  type PlatformIntegrationCategory,
  type PlatformIntegrationTab,
  type PlatformRegistrationIntegrationItem
} from "@/lib/config/platform-registration-catalog";

type PlatformIntegrationCard = PlatformRegistrationIntegrationItem & {
  status: "connected" | "configured" | "not_connected" | "planned" | "coming_soon";
};

export function PlatformRegistrationIntegrationsClient({
  integrations
}: {
  integrations: PlatformIntegrationCard[];
}) {
  const [activeTab, setActiveTab] = useState<PlatformIntegrationTab>("All Providers");

  const filtered = useMemo(() => {
    if (activeTab === "All Providers") {
      return integrations;
    }
    return integrations.filter((integration) => integration.category === activeTab);
  }, [activeTab, integrations]);

  const groupedForAll = useMemo(() => {
    if (activeTab !== "All Providers") {
      return [] as Array<{ category: PlatformIntegrationCategory; items: PlatformIntegrationCard[] }>;
    }

    const categories = PLATFORM_INTEGRATION_TABS.filter(
      (tab): tab is PlatformIntegrationCategory => tab !== "All Providers"
    );

    return categories
      .map((category) => ({
        category,
        items: integrations.filter((integration) => integration.category === category)
      }))
      .filter((group) => group.items.length > 0);
  }, [activeTab, integrations]);

  return (
    <section className="space-y-7">
      <PageHeader
        title="Integrations"
        subtitle="Manage registration providers and event data integrations."
      />

      <div className="border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pb-2">
          {PLATFORM_INTEGRATION_TABS.map((tab) => {
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

      {activeTab === "All Providers" ? (
        <div className="space-y-10">
          {groupedForAll.map((group) => (
            <section key={group.category} className="space-y-4">
              <h2 className="text-lg font-bold text-slate-800">{group.category}</h2>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {group.items.map((integration) => (
                  <PlatformIntegrationCardView key={integration.id} integration={integration} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filtered.map((integration) => (
            <PlatformIntegrationCardView key={integration.id} integration={integration} />
          ))}
        </div>
      )}
    </section>
  );
}

function PlatformIntegrationCardView({ integration }: { integration: PlatformIntegrationCard }) {
  const isConnected = integration.status === "connected";
  const isConfigured = integration.status === "configured";
  const isNotConnected = integration.status === "not_connected";
  const isPlanned = integration.status === "planned";
  const isComingSoon = integration.status === "coming_soon";

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.info("[registration-integrations] provider logo src", {
        provider: integration.provider,
        name: integration.name,
        logoSrc: integration.logoSrc,
      });
    }
  }, [integration.logoSrc, integration.name, integration.provider]);

  const ctaLabel = isConnected || isConfigured
    ? `Manage ${integration.name}`
    : isNotConnected
      ? "Open Setup"
    : isComingSoon
      ? "Coming Soon"
      : integration.route
        ? "Open Setup"
        : "Planned";

  return (
    <article className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
            <img
              src={integration.logoSrc}
              alt={`${integration.name} logo`}
              className="h-10 w-10 object-contain"
              loading="lazy"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">{integration.name}</h3>
            <p className="text-base leading-snug text-slate-600">{integration.description}</p>
          </div>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${
            isConnected
              ? "bg-emerald-100 text-emerald-700"
              : isConfigured
                ? "bg-indigo-100 text-indigo-700"
              : isNotConnected
                ? "bg-slate-200 text-slate-700"
              : isPlanned
                ? "bg-violet-100 text-violet-700"
                : "bg-amber-100 text-amber-700"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isConnected
                ? "bg-emerald-600"
                : isConfigured
                  ? "bg-indigo-600"
                : isNotConnected
                  ? "bg-slate-500"
                  : isPlanned
                    ? "bg-violet-600"
                    : "bg-amber-600"
            }`}
          />
          {isConnected
            ? "Connected"
            : isConfigured
              ? "Configured"
              : isNotConnected
                ? "Not Connected"
                : isPlanned
                  ? "Planned"
                  : "Coming Soon"}
        </span>
      </div>

      <div className="mt-6 rounded-2xl bg-slate-100 px-5 py-4">
        <p className="text-base font-medium leading-snug text-slate-600">{integration.helperText}</p>
      </div>

      <div className="mt-6">
        {integration.route && !isComingSoon ? (
          <Link
            href={integration.route}
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
      </div>
    </article>
  );
}
